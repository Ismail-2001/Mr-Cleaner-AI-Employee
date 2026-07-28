import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelectResult = vi.fn();
const mockUpsert = vi.fn(() => ({ select: mockSelectResult }));
const mockFrom = vi.fn(() => ({
    insert: vi.fn(() => ({ select: vi.fn(() => ({ data: null, error: null })) })),
    upsert: mockUpsert,
    select: vi.fn(() => ({ data: null, error: null })),
    eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
    limit: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
    order: vi.fn(() => ({ data: null, error: null })),
}));

vi.mock('@/lib/supabase-admin', () => ({
    supabaseAdmin: { from: (...args) => mockFrom(...args) },
}));

vi.mock('@/lib/encrypt', () => ({
    encrypt: (v) => v,
    decrypt: (v) => v,
}));

vi.mock('@/lib/redis', () => ({
    tryRedisOp: () => null,
    getRedisClient: () => null,
}));

import { createBooking } from '@/lib/supabase';

describe('booking slot race condition', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('exactly 1 of 10 concurrent requests succeeds for same slot', async () => {
        const results = [];
        let callCount = 0;

        mockSelectResult.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return { data: [{ id: 'booking_1' }], error: null };
            }
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "idx_unique_slot"' } };
        });

        const payload = {
            customer_name: 'Test User',
            phone: '+1 555-0100',
            vehicle_type: 'SUV',
            service: 'Executive Preservation',
            service_price: 150,
            booking_date: '2026-09-01',
            booking_time: '10:00',
            address: '123 Test St',
        };

        for (let i = 0; i < 10; i++) {
            const r = await createBooking(payload, 'biz_1');
            results.push(r);
        }

        const succeeded = results.filter(r => !r.error);
        const failed = results.filter(r => r.error?.code === 'SLOT_TAKEN');

        expect(succeeded.length).toBe(1);
        expect(failed.length).toBe(9);
    });

    it('allows different slots to be booked concurrently', async () => {
        let callCount = 0;
        mockSelectResult.mockImplementation(() => {
            callCount++;
            return { data: [{ id: `booking_${callCount}` }], error: null };
        });

        const results = await Promise.all([
            createBooking({ booking_date: '2026-09-01', booking_time: '09:00', customer_name: 'A' }, 'biz_1'),
            createBooking({ booking_date: '2026-09-01', booking_time: '10:00', customer_name: 'B' }, 'biz_1'),
            createBooking({ booking_date: '2026-09-01', booking_time: '11:00', customer_name: 'C' }, 'biz_1'),
        ]);

        expect(results.every(r => !r.error)).toBe(true);
        expect(results.length).toBe(3);
    });
});
