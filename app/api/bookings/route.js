import { createBooking, getBookings } from '@/lib/supabase';
import { createCalendarEvent } from '@/lib/calendar';
import { triggerLeadAlerts } from '@/lib/twilio';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkAvailability } from '@/lib/calendar';
import { validateBody, BookingRequestSchema } from '@/lib/api-validation';
import { checkBookingRateLimit } from '@/lib/rate-limit';
import { redactBookingData } from '@/lib/pii-redact';
import { resolveBusinessId } from '@/lib/tenant';
import { tryRedisOp } from '@/lib/redis';
import { log } from '@/lib/logger';

/**
 * WHY THIS RE-VERIFICATION EXISTS:
 * The old code checked availability in the chat flow, then inserted without
 * re-checking. Two customers chatting simultaneously could both be told a slot
 * is open and both get booked. Now we verify availability immediately before
 * insert (application-level) AND have a unique constraint on
 * (booking_date, booking_time) as a database-level backstop.
 */

/**
 * Parse a time string (e.g., "8:00 AM", "08:00", "2:00 PM") into minutes since midnight.
 */
function parseTimeToMinutes(timeStr) {
    if (!timeStr) return null;
    const s = timeStr.trim();

    const match12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/i);
    if (match12) {
        let hours = parseInt(match12[1], 10);
        const minutes = parseInt(match12[2], 10);
        const period = match12[3].toUpperCase();
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        return hours * 60 + minutes;
    }

    const match24 = s.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
        const hours = parseInt(match24[1], 10);
        const minutes = parseInt(match24[2], 10);
        return hours * 60 + minutes;
    }

    return null;
}

async function isSlotStillAvailable(date, time, businessId) {
    const slots = await checkAvailability(date, 120, businessId);
    const requestedMinutes = parseTimeToMinutes(time);

    if (requestedMinutes === null) {
        log.warn('bookings', 'Could not parse booking time for availability check', { time });
        return false;
    }

    return slots.some(slot => {
        const slotMinutes = parseTimeToMinutes(slot.time);
        return slotMinutes === requestedMinutes && slot.status === 'available';
    });
}

// ─── Advisory Lock: Redis-based distributed lock ──────────────────────────────
// Prevents TOCTOU race: two concurrent requests both see a slot as available
// and both proceed to insert. Lock key = date:time:businessId.
// In-memory fallback is intentionally omitted — a false sense of security on
// serverless is worse than no lock. When Redis is unavailable, we rely on the
// DB unique constraint (idx_unique_slot) as the hard backstop.
const SLOT_LOCK_TTL_MS = 30_000;

async function acquireSlotLock(date, time, businessId) {
    const lockKey = `booking:lock:${businessId}:${date}:${time}`;

    const redisResult = await tryRedisOp(async (redis) => {
        const acquired = await redis.set(lockKey, '1', { nx: true, px: SLOT_LOCK_TTL_MS });
        return acquired !== null;
    });

    if (redisResult === true) return true;
    if (redisResult === false) return false;

    // Redis unavailable — log warning, rely on DB constraint
    log.warn('bookings', 'Redis unavailable for slot lock — relying on DB unique constraint');
    return true;
}

export async function GET(req) {
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');

    if (date) {
        try {
            const availability = await checkAvailability(date);
            return Response.json({ availability }, {
                headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' },
            });
        } catch (error) {
            log.error('bookings', 'Availability check failed', { requestId, error: error.message });
            return Response.json(
                { error: { code: 'AVAILABILITY_ERROR', message: 'Failed to check availability', request_id: requestId } },
                { status: 500 }
            );
        }
    }

    try {
        // MULTI-TENANT: Resolve which business this dashboard request is for.
        // Without this, the dashboard returns ALL bookings across ALL businesses.
        const businessId = await resolveBusinessId(req);

        const { data, error } = await getBookings(businessId);
        if (error) {
            log.error('bookings', 'Get bookings failed', { requestId, error });
            return Response.json(
                { error: { code: 'DB_ERROR', message: 'Failed to fetch bookings', request_id: requestId } },
                { status: 500 }
            );
        }

        // SECURITY: Do not expose isCalendarConnected to the client.
        // It reveals operational information about the business's integrations.
        // The dashboard can determine this from the settings page instead.

        return Response.json({
            bookings: data || []
        }, {
            headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
        });
    } catch (error) {
        log.error('bookings', 'GET /api/bookings error', { requestId, error: error.message });
        return Response.json(
            { error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: requestId } },
            { status: 500 }
        );
    }
}

export async function POST(req) {
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();

    // RATE LIMITING: 5 booking attempts per minute per IP.
    // Prevents spam bookings that burn Twilio SMS credits and flood the calendar.
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const rateLimit = await checkBookingRateLimit(ip);
    if (rateLimit) {
        log.info('bookings', 'Booking rate limited', { requestId, ip });
        return Response.json(
            { error: { code: 'RATE_LIMITED', message: `Too many requests. Try again in ${rateLimit.retryAfterSec}s.`, request_id: requestId } },
            { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } }
        );
    }

    try {
        // REQUEST VALIDATION: Reject malformed booking payloads before
        // they reach the database or business logic.
        const body = await req.json();
        const validation = validateBody(BookingRequestSchema, body);
        if (!validation.success) {
            log.info('bookings', 'Booking validation failed', { requestId });
            return validation.response;
        }
        const bookingData = validation.data;
        // PII REDACTION: Never log raw customer data
        log.info('bookings', 'Creating booking', { requestId, booking: redactBookingData(bookingData) });

        // MULTI-TENANT: Resolve which business this booking belongs to.
        const businessId = await resolveBusinessId(req);

        // RACE CONDITION FIX: Distributed advisory lock + slot re-verify.
        // SOFT PRE-CHECK: Best-effort availability verification before insert.
        // The DB unique constraint (idx_unique_slot) is the SOURCE OF TRUTH.
        // This check prevents most conflicts early, but is not a hard guarantee.
        if (bookingData.booking_date && bookingData.booking_time) {
            const lockAcquired = await acquireSlotLock(
                bookingData.booking_date,
                bookingData.booking_time,
                businessId
            );
            if (!lockAcquired) {
                log.info('bookings', 'Slot lock contended', { requestId, date: bookingData.booking_date, time: bookingData.booking_time });
                return Response.json({
                    error: { code: 'SLOT_TAKEN', message: 'This time slot is being booked by another customer. Please select a different time.', request_id: requestId }
                }, { status: 409 });
            }

            const stillAvailable = await isSlotStillAvailable(
                bookingData.booking_date,
                bookingData.booking_time,
                businessId
            );
            if (!stillAvailable) {
                log.info('bookings', 'Pre-check slot taken', { requestId, date: bookingData.booking_date, time: bookingData.booking_time });
                return Response.json({
                    error: { code: 'SLOT_TAKEN', message: 'This time slot was just booked by another customer. Please select a different time.', request_id: requestId }
                }, { status: 409 });
            }
        }

        // 1. Save to Database
        const { data, error } = await createBooking(bookingData, businessId);
        if (error) {
            if (error.code === 'SLOT_TAKEN') {
                return Response.json({ error: { ...error, request_id: requestId } }, { status: 409 });
            }
            log.error('bookings', 'DB Error', { requestId, error });
            return Response.json(
                { error: { code: 'BOOKING_CREATE_FAILED', message: 'Failed to save booking', request_id: requestId } },
                { status: 500 }
            );
        }

        // 2. Create Calendar Event
        try {
            await createCalendarEvent(bookingData);
        } catch (calError) {
            log.error('bookings', 'Calendar event failed (non-fatal)', { requestId, error: calError.message });
        }

        // 3. Trigger Expert Dual Alerts
        try {
            await triggerLeadAlerts(bookingData);
        } catch (smsError) {
            log.error('bookings', 'SMS alert failed (non-fatal)', { requestId, error: smsError.message });
        }

        log.info('bookings', 'Booking created successfully', { requestId, bookingId: data?.id });
        return Response.json(data);
    } catch (error) {
        log.error('bookings', 'POST /api/bookings error', { requestId, error: error.message });
        return Response.json(
            { error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: requestId } },
            { status: 500 }
        );
    }
}
