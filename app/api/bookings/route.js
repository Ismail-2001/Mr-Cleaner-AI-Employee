import { createBooking, getBookings } from '@/lib/supabase';
import { createCalendarEvent } from '@/lib/calendar';
import { triggerLeadAlerts } from '@/lib/twilio';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkAvailability } from '@/lib/calendar';
import { validateBody, BookingRequestSchema } from '@/lib/api-validation';

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

async function isSlotStillAvailable(date, time) {
    const slots = await checkAvailability(date);
    const requestedMinutes = parseTimeToMinutes(time);

    if (requestedMinutes === null) {
        console.warn(`Could not parse booking time "${time}" for availability check`);
        return false;
    }

    return slots.some(slot => {
        const slotMinutes = parseTimeToMinutes(slot.time);
        return slotMinutes === requestedMinutes && slot.status === 'available';
    });
}

export async function GET(req) {
    const requestId = crypto.randomUUID();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');

    if (date) {
        try {
            const availability = await checkAvailability(date);
            return Response.json({ availability });
        } catch (error) {
            console.error(`[${requestId}] Availability check failed:`, error.message);
            return Response.json(
                { error: { code: 'AVAILABILITY_ERROR', message: 'Failed to check availability', request_id: requestId } },
                { status: 500 }
            );
        }
    }

    try {
        const { data, error } = await getBookings();
        if (error) {
            console.error(`[${requestId}] Get bookings failed:`, error);
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
        });
    } catch (error) {
        console.error(`[${requestId}] GET /api/bookings error:`, error.message);
        return Response.json(
            { error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: requestId } },
            { status: 500 }
        );
    }
}

export async function POST(req) {
    const requestId = crypto.randomUUID();
    try {
        // REQUEST VALIDATION: Reject malformed booking payloads before
        // they reach the database or business logic.
        const body = await req.json();
        const validation = validateBody(BookingRequestSchema, body);
        if (!validation.success) {
            console.log(`[${requestId}] Booking validation failed`);
            return validation.response;
        }
        const bookingData = validation.data;
        console.log(`[${requestId}] Creating booking:`, bookingData);

        // RACE CONDITION FIX: Re-verify slot availability immediately before insert.
        if (bookingData.booking_date && bookingData.booking_time) {
            const stillAvailable = await isSlotStillAvailable(
                bookingData.booking_date,
                bookingData.booking_time
            );
            if (!stillAvailable) {
                console.log(`[${requestId}] Slot taken:`, bookingData.booking_date, bookingData.booking_time);
                return Response.json({
                    error: { code: 'SLOT_TAKEN', message: 'This time slot was just booked by another customer. Please select a different time.', request_id: requestId }
                }, { status: 409 });
            }
        }

        // 1. Save to Database
        const { data, error } = await createBooking(bookingData);
        if (error) {
            if (error.code === 'SLOT_TAKEN') {
                return Response.json({ error: { ...error, request_id: requestId } }, { status: 409 });
            }
            console.error(`[${requestId}] DB Error:`, error);
            return Response.json(
                { error: { code: 'BOOKING_CREATE_FAILED', message: 'Failed to save booking', request_id: requestId } },
                { status: 500 }
            );
        }

        // 2. Create Calendar Event
        try {
            await createCalendarEvent(bookingData);
        } catch (calError) {
            console.error(`[${requestId}] Calendar event failed (non-fatal):`, calError.message);
        }

        // 3. Trigger Expert Dual Alerts
        try {
            await triggerLeadAlerts(bookingData);
        } catch (smsError) {
            console.error(`[${requestId}] SMS alert failed (non-fatal):`, smsError.message);
        }

        console.log(`[${requestId}] Booking created successfully:`, data?.id);
        return Response.json(data);
    } catch (error) {
        console.error(`[${requestId}] POST /api/bookings error:`, error.message);
        return Response.json(
            { error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: requestId } },
            { status: 500 }
        );
    }
}
