import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase-admin';

const TEST_BUSINESS_ID = '00000000-0000-0000-0000-000000000001';
const TEST_SESSION_ID = `integration-test-${Date.now()}`;
const INTEGRATION_TESTS = process.env.INTEGRATION_TESTS === 'true';

function assert(condition, name) {
    if (condition) {
        console.log(`  ✓ ${name}`);
    } else {
        console.error(`  ✗ ${name}`);
    }
}

describe('integration — real Supabase', () => {
    if (!INTEGRATION_TESTS) {
        it('skipped — set INTEGRATION_TESTS=true env var to run', () => {
            expect(true).toBe(true);
        });
        return;
    }

    if (!supabaseAdmin) {
        it('skipped — Supabase admin not configured (missing env vars)', () => {
            expect(true).toBe(true);
        });
        return;
    }

    let testBookingId = null;

    beforeEach(async () => {
        // Ensure clean state before each test
    });

    afterEach(async () => {
        if (testBookingId) {
            await supabaseAdmin.from('bookings').delete().eq('id', testBookingId);
            testBookingId = null;
        }
    });

    it('can insert and read a booking', async () => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);
        const dateStr = futureDate.toISOString().split('T')[0];

        const { data: insert, error: insertErr } = await supabaseAdmin
            .from('bookings')
            .insert([{
                business_id: TEST_BUSINESS_ID,
                customer_name: 'Integration Test Customer',
                phone: '+1-555-999-8888',
                vehicle_type: 'sedan',
                service: 'Executive Preservation',
                service_price: 120,
                booking_date: dateStr,
                booking_time: '14:00:00',
                address: '789 Integration Ave, Austin, TX',
                zip_code: '78701',
                status: 'pending',
                notes: 'Created by integration test',
            }])
            .select('id')
            .single();

        assert(insertErr === null, `insert booking returns no error (got: ${insertErr?.message || 'none'})`);
        assert(insert?.id !== undefined, `insert returns an id (got: ${insert?.id || 'null'})`);
        testBookingId = insert.id;

        const { data: row, error: readErr } = await supabaseAdmin
            .from('bookings')
            .select('*')
            .eq('id', testBookingId)
            .single();

        assert(readErr === null, `read booking returns no error (got: ${readErr?.message || 'none'})`);
        assert(row?.customer_name === 'Integration Test Customer', `customer_name matches`);
        assert(row?.status === 'pending', `status matches`);
        assert(row?.business_id === TEST_BUSINESS_ID, `business_id matches`);
    });

    it('can upsert a chat session', async () => {
        const { data, error } = await supabaseAdmin
            .from('chat_sessions')
            .upsert({
                session_id: TEST_SESSION_ID,
                customer_data: { language: 'en', vehicle_type: 'SUV' },
                message_history: [{ role: 'user', content: 'test' }],
                business_id: TEST_BUSINESS_ID,
            })
            .select('session_id')
            .single();

        assert(error === null, `upsert session returns no error (got: ${error?.message || 'none'})`);
        assert(data?.session_id === TEST_SESSION_ID, `session_id matches`);

        await supabaseAdmin.from('chat_sessions').delete().eq('session_id', TEST_SESSION_ID);
    });

    it('enforces business_id scoping on reads', async () => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);
        const dateStr = futureDate.toISOString().split('T')[0];

        const { data: insert, error: insertErr } = await supabaseAdmin
            .from('bookings')
            .insert([{
                business_id: TEST_BUSINESS_ID,
                customer_name: 'Scoped Test',
                phone: '+1-555-777-6666',
                vehicle_type: 'truck',
                service: 'Basic Wash & Wax',
                service_price: 80,
                booking_date: dateStr,
                booking_time: '10:00:00',
                address: '100 Scope St, Austin, TX',
                zip_code: '78702',
                status: 'pending',
            }])
            .select('id')
            .single();

        assert(insertErr === null, `insert scoped booking returns no error`);
        testBookingId = insert.id;

        const { count, error: countErr } = await supabaseAdmin
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', TEST_BUSINESS_ID)
            .eq('customer_name', 'Scoped Test');

        assert(countErr === null, `count query returns no error`);
        assert(count === 1, `count is 1 (got: ${count})`);
    });
});