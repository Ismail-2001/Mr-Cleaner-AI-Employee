import { google } from 'googleapis';
import { supabaseAdmin } from './supabase-admin';

// OAuth2 config — used to create fresh clients per request (avoids race condition).
const OAUTH2_CONFIG = {
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI,
};

// Module-level client only for token exchange and auth URL generation (not for API calls)
const oauth2Client = new google.auth.OAuth2(
    OAUTH2_CONFIG.clientId,
    OAUTH2_CONFIG.clientSecret,
    OAUTH2_CONFIG.redirectUri
);

// --- AUTH TOKEN PERSISTENCE ---
// Listen for token refreshes and persist them to Supabase automatically.
oauth2Client.on('tokens', async (tokens) => {
    if (supabaseAdmin) {
        const { error } = await supabaseAdmin.from('application_config').upsert({
            id: 'google_tokens',
            data: tokens,
            updated_at: new Date().toISOString()
        });
        if (error) console.error("Failed to persist refreshed tokens:", error);
    }
});

/**
 * Create a fresh OAuth2 client with stored tokens.
 * WHY: The old code mutated a shared singleton with setCredentials().
 * In concurrent requests, Request A's tokens could be overwritten by Request B,
 * causing Request A to use the wrong credentials. Creating a fresh client per
 * request eliminates this race condition.
 */
async function getAuthenticatedClient() {
    const tokens = await getStoredTokens();
    if (!tokens) return null;

    const client = new google.auth.OAuth2(
        OAUTH2_CONFIG.clientId,
        OAUTH2_CONFIG.clientSecret,
        OAUTH2_CONFIG.redirectUri
    );
    client.setCredentials(tokens);

    // Re-attach token refresh listener on the fresh client
    client.on('tokens', async (newTokens) => {
        if (supabaseAdmin) {
            await supabaseAdmin.from('application_config').upsert({
                id: 'google_tokens',
                data: newTokens,
                updated_at: new Date().toISOString()
            });
        }
    });

    return client;
}


async function getStoredTokens() {
    if (!supabaseAdmin) return null;
    const { data, error } = await supabaseAdmin
        .from('application_config')
        .select('data')
        .eq('id', 'google_tokens')
        .single();

    return data ? data.data : null;
}

const TIMEZONE = process.env.BUSINESS_TIMEZONE || 'America/Chicago';

export async function checkAvailability(date, requestedDuration = 120) {
    // Get existing bookings for this date from the database.
    // This prevents showing slots that were booked via the API but not yet
    // synced to Google Calendar — a gap that could cause double-booking.
    const bookedTimes = await getBookedTimesForDate(date);

    const client = await getAuthenticatedClient();
    if (!client) {
        console.warn("No Google Calendar tokens found. Using mock availability.");
        const mockSlots = [
            { time: '8:00 AM', status: 'available' },
            { time: '11:00 AM', status: 'available' },
            { time: '2:00 PM', status: 'available' }
        ];
        return filterBookedSlots(mockSlots, bookedTimes);
    }

    const calendar = google.calendar({ version: 'v3', auth: client });

    try {
        // SECURITY: Use explicit ISO format with timezone to avoid locale-dependent
        // parsing. Use Intl.DateTimeFormat to get the correct UTC offset for the
        // given timezone on the given date (handles DST automatically).
        const tzDate = new Date(`${date}T12:00:00`);
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: TIMEZONE,
            timeZoneName: 'shortOffset'
        }).formatToParts(tzDate);
        const tzPart = parts.find(p => p.type === 'timeZoneName');
        const tzOffset = tzPart ? tzPart.value.replace('GMT', '') || '+00:00' : '-06:00';
        const startOfDay = new Date(`${date}T08:00:00${tzOffset}`);
        const endOfDay = new Date(`${date}T18:00:00${tzOffset}`);

        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: startOfDay.toISOString(),
            timeMax: endOfDay.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });

        const events = response.data.items || [];
        const busyTimes = events.map(event => ({
            start: new Date(event.start.dateTime || event.start.date),
            end: new Date(event.end.dateTime || event.end.date)
        }));

        // Generate dynamic slots every 60 mins
        const availableSlots = [];
        let currentSlot = new Date(startOfDay);

        while (currentSlot.getTime() + (requestedDuration * 60000) <= endOfDay.getTime()) {
            const slotEnd = new Date(currentSlot.getTime() + (requestedDuration * 60000));

            const isOverlap = busyTimes.some(busy => {
                return (currentSlot < busy.end && slotEnd > busy.start);
            });

            if (!isOverlap) {
                availableSlots.push({
                    time: currentSlot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                    status: 'available'
                });
            }

            currentSlot.setMinutes(currentSlot.getMinutes() + 60);
        }

        // Cross-reference: mark slots as unavailable if they have a booking
        // in the database that isn't cancelled.
        return filterBookedSlots(availableSlots, bookedTimes);
    } catch (error) {
        console.error("Calendar API Error:", error);
        return [];
    }
}

/**
 * Query Supabase for all booked times on a given date.
 * Returns an array of time strings (e.g., ["8:00 AM", "2:00 PM"]).
 * Uses admin client to bypass RLS.
 */
async function getBookedTimesForDate(date) {
    if (!supabaseAdmin) return [];

    try {
        const { data, error } = await supabaseAdmin
            .from('bookings')
            .select('booking_time')
            .eq('booking_date', date)
            .not('status', 'eq', 'cancelled');

        if (error || !data) return [];

        // booking_time is stored as TIME (e.g., "08:00:00") or as part of scheduled_at.
        // Return the raw time strings for matching.
        return data.map(b => b.booking_time).filter(Boolean);
    } catch {
        return [];
    }
}

/**
 * Filter available slots by removing any that match a booked time.
 * Uses minutes-since-midnight comparison for reliable matching across formats.
 */
function filterBookedSlots(slots, bookedTimes) {
    if (!bookedTimes || bookedTimes.length === 0) return slots;

    return slots.map(slot => {
        const slotMinutes = parseTimeToMinutes(slot.time);
        const isBooked = bookedTimes.some(booked => {
            const bookedMinutes = parseTimeToMinutes(booked);
            return slotMinutes !== null && bookedMinutes !== null && slotMinutes === bookedMinutes;
        });

        return isBooked ? { ...slot, status: 'booked' } : slot;
    });
}

/**
 * Parse a time string into minutes since midnight for comparison.
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

    const match24 = s.match(/^(\d{1,2}):(\d{2})/);
    if (match24) {
        const hours = parseInt(match24[1], 10);
        const minutes = parseInt(match24[2], 10);
        return hours * 60 + minutes;
    }

    return null;
}

export async function createCalendarEvent(booking) {
    const client = await getAuthenticatedClient();
    if (!client) {
        return { success: true };
    }

    const calendar = google.calendar({ version: 'v3', auth: client });

    // SECURITY: Use Intl.DateTimeFormat for correct DST-aware timezone offset
    const tzDate = new Date(`${booking.booking_date}T12:00:00`);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        timeZoneName: 'shortOffset'
    }).formatToParts(tzDate);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    const tzOffset = tzPart ? tzPart.value.replace('GMT', '') || '+00:00' : '-06:00';
    const startDateTime = new Date(`${booking.booking_date}T${booking.booking_time}${tzOffset}`);
    const endDateTime = new Date(startDateTime.getTime() + 2 * 60 * 60 * 1000); // 2 hour default

    const event = {
        summary: `${booking.service} - ${booking.customer_name}`,
        location: booking.address,
        description: `Vehicle: ${booking.vehicle_type}\nPhone: ${booking.phone}\nPrice: $${booking.service_price}`,
        start: { dateTime: startDateTime.toISOString(), timeZone: TIMEZONE },
        end: { dateTime: endDateTime.toISOString(), timeZone: TIMEZONE },
    };

    try {
        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
        });
        return { success: true, eventId: response.data.id };
    } catch (error) {
        console.error("Error creating event:", error);
        return { success: false, error };
    }
}

export function getAuthUrl() {
    // CSRF PROTECTION: Generate a random state value to prevent OAuth CSRF attacks.
    // Without this, an attacker can link their Google account to the business's
    // calendar by tricking the owner into visiting a crafted callback URL.
    const state = crypto.randomUUID();
    return {
        url: oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly'],
            prompt: 'consent',
            state
        }),
        state
    };
}

export async function handleAuthCallback(code) {
    try {
        const { tokens } = await oauth2Client.getToken(code);

        if (supabaseAdmin) {
            const { error } = await supabaseAdmin.from('application_config').upsert({
                id: 'google_tokens',
                data: tokens,
                updated_at: new Date().toISOString()
            });

            if (error) {
                throw new Error("Failed to store tokens in database");
            }
        }

        return tokens;
    } catch (error) {
        console.error("OAuth callback error:", error.message);
        throw new Error("Authentication failed");
    }
}
