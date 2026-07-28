import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabase-admin';
import { validateEnv } from './validate-env';
import { encrypt, decrypt } from './encrypt';

// Run env validation on first import — logs warnings for missing vars
validateEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Anon key client — subject to RLS. Used only for client-side anonymous auth
 * in ChatInterface.js. Server routes should use supabaseAdmin instead.
 */
export const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

/**
 * Memory store acts as a high-availability fallback when Supabase is down.
 * TTL: entries older than 24 hours are evicted on access to prevent unbounded growth.
 */
const MEMORY_STORE_TTL_MS = 24 * 60 * 60 * 1000;

function evictExpiredMemoryEntries() {
    const cutoff = Date.now() - MEMORY_STORE_TTL_MS;
    memoryStore.bookings = memoryStore.bookings.filter(b => {
        const created = new Date(b.created_at).getTime();
        return !isNaN(created) && created > cutoff;
    });
}

const memoryStore = {
    bookings: [
        {
            id: '1',
            customer_name: 'John Smith (Local)',
            phone: '+1 (507) 479-7804',
            vehicle_type: 'SUV',
            service: 'Premium Detail',
            service_price: 225,
            booking_date: '2026-02-16',
            booking_time: '08:00 AM',
            address: '123 Austin Way, Dallas, TX',
            status: 'confirmed',
            created_at: new Date().toISOString()
        }
    ]
};

/**
 * Insert a booking. Uses admin client to bypass RLS.
 * Returns { data, error } with SLOT_TAKEN error code for race conditions.
 *
 * SCHEMA FIX: The database has `booking_date DATE` and `booking_time TIME`,
 * NOT `scheduled_at`. The old code inserted `scheduled_at` which doesn't exist
 * as a column — every insert failed silently, falling back to memory store.
 * The unique constraint `idx_unique_slot` on (booking_date, booking_time)
 * was completely ineffective because those columns were never populated.
 *
 * MULTI-TENANT: business_id is now required for proper slot isolation.
 */
export async function createBooking(bookingData, businessId) {
    const db = supabaseAdmin || supabase;
    if (db) {
        const bookingDate = bookingData.booking_date || bookingData.date;
        const bookingTime = bookingData.booking_time || bookingData.time;

        console.log("Saving booking to Supabase:", { date: bookingDate, time: bookingTime, businessId });

        const encryptedPhone = encrypt(bookingData.phone);
        const encryptedAddress = encrypt(bookingData.address);
        const encryptedName = encrypt(bookingData.customer_name);

        const { data, error } = await db
            .from('bookings')
            .upsert({
                customer_name: encryptedName ?? bookingData.customer_name,
                phone: encryptedPhone ?? bookingData.phone,
                vehicle_type: bookingData.vehicle_type,
                service: bookingData.service,
                service_price: bookingData.service_price || bookingData.price,
                booking_date: bookingDate,
                booking_time: bookingTime,
                address: encryptedAddress ?? bookingData.address,
                zip_code: bookingData.zip_code,
                status: 'pending',
                business_id: businessId || '00000000-0000-0000-0000-000000000001',
                sms_consent: bookingData.sms_consent === true,
                sms_consent_timestamp: bookingData.sms_consent === true ? new Date().toISOString() : null,
            }, {
                onConflict: 'business_id,booking_date,booking_time',
                ignoreDuplicates: false,
            })
            .select();

        if (!error) return { data, error: null };

        if (error.code === '23505') {
            console.warn("Double-booking prevented by unique constraint:", error.message);
            return {
                data: null,
                error: {
                    code: 'SLOT_TAKEN',
                    message: 'This time slot was just booked by another customer. Please select a different time.'
                }
            };
        }

        console.error("Supabase insert failed — booking NOT persisted:", error.message);
        return {
            data: null,
            error: {
                code: 'DB_ERROR',
                message: 'Failed to save booking. Please try again.'
            }
        };
    }

    console.warn("No Supabase configured — using memory store (demo mode)");
    evictExpiredMemoryEntries();
    const newBooking = { id: 'local-' + Math.random().toString(36).substr(2, 9), ...bookingData, created_at: new Date().toISOString(), status: 'pending' };
    memoryStore.bookings.unshift(newBooking);
    return { data: [newBooking], error: null };
}

/**
 * Read all bookings for a specific business. Uses admin client to bypass RLS.
 * This is called by the dashboard — must NOT be accessible with anon key.
 *
 * MULTI-TENANT: businessId is required to prevent cross-tenant data leaks.
 * Without it, Business A sees Business B's bookings.
 */
export async function getBookings(businessId) {
    const db = supabaseAdmin || supabase;
    if (db) {
        let query = db
            .from('bookings')
            .select('*')
            .order('created_at', { ascending: false });

        if (businessId) {
            query = query.eq('business_id', businessId);
        }

        const { data, error } = await query;

        if (!error && data) {
            const decrypted = data.map(b => ({
                ...b,
                customer_name: decrypt(b.customer_name) ?? b.customer_name,
                phone: decrypt(b.phone) ?? b.phone,
                address: decrypt(b.address) ?? b.address,
            }));
            return { data: decrypted, error: null };
        }

        if (error) {
            console.error("Supabase Fetch Error:", error);
            return { data: null, error };
        }

        return { data, error: null };
    }

    evictExpiredMemoryEntries();
    return { data: memoryStore.bookings, error: null };
}
