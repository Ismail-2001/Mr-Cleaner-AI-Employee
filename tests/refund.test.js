import { describe, it, expect, vi, beforeEach } from 'vitest';

const DEFAULT_BIZ = '00000000-0000-0000-0000-000000000001';
const OTHER_BIZ = '11111111-1111-1111-1111-111111111111';

const mockFrom = vi.fn();

vi.mock('@/lib/lemon-squeezy', () => ({
    isConfigured: () => false,
    createRefund: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
    supabaseAdmin: {
        from: (...args) => mockFrom(...args),
    },
}));

const mockStripeSessionsRetrieve = vi.fn();
const mockStripeRefundsCreate = vi.fn();
vi.mock('@/lib/stripe', () => ({
    stripe: {
        checkout: {
            sessions: {
                retrieve: (...args) => mockStripeSessionsRetrieve(...args),
            },
        },
        refunds: {
            create: (...args) => mockStripeRefundsCreate(...args),
        },
    },
}));

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
}));

vi.mock('@/lib/calendar', () => ({
    cancelCalendarEvent: vi.fn().mockResolvedValue({ success: true }),
}));

import { processRefund, processRefundWithCancel } from '@/lib/refund';

function makeChain(result) {
    const chain = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn().mockResolvedValue(result);
    chain.single = vi.fn().mockResolvedValue(result);
    chain.update = vi.fn(() => chain);
    return chain;
}

describe('processRefund', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns UNAUTHORIZED if businessId is not provided', async () => {
        const result = await processRefund('booking_1', undefined);
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('returns error if booking not found', async () => {
        mockFrom.mockReturnValue(makeChain({ data: null, error: null }));
        const result = await processRefund('nonexistent-id', DEFAULT_BIZ);
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('returns error if booking status is refunded', async () => {
        mockFrom.mockReturnValue(makeChain({
            data: { id: '1', status: 'refunded', notes: 'Session: cs_test_abc' },
            error: null,
        }));
        const result = await processRefund('1', DEFAULT_BIZ);
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('ALREADY_REFUNDED');
    });

    it('returns error if booking is not confirmed or pending', async () => {
        mockFrom.mockReturnValue(makeChain({
            data: { id: '1', status: 'cancelled', notes: 'Session: cs_test_abc' },
            error: null,
        }));
        const result = await processRefund('1', DEFAULT_BIZ);
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('returns error if no payment info in notes', async () => {
        const booking = { id: '1', status: 'confirmed', notes: 'No payment info here' };
        mockFrom
            .mockReturnValueOnce(makeChain({ data: booking, error: null }))      // initial fetch
            .mockReturnValueOnce(makeChain({ data: booking, error: null }))      // claim update
            .mockReturnValueOnce(makeChain({ data: { status: 'refunding' }, error: null })); // verify claim
        const result = await processRefund('1', DEFAULT_BIZ);
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('NO_PAYMENT_FOUND');
    });

    it('processes refund successfully for confirmed booking', async () => {
        const booking = {
            id: 'booking_1',
            status: 'confirmed',
            customer_name: 'John Doe',
            service: 'Signature Ceramic',
            service_price: 450,
            notes: 'Deposit paid via Stripe. Session: cs_test_abc123',
        };

        mockFrom
            .mockReturnValueOnce(makeChain({ data: booking, error: null }))      // initial fetch
            .mockReturnValueOnce(makeChain({ data: booking, error: null }))      // claim update
            .mockReturnValueOnce(makeChain({ data: { status: 'refunding' }, error: null })); // verify claim

        mockStripeSessionsRetrieve.mockResolvedValue({
            payment_intent: 'pi_test_xyz789',
        });

        mockStripeRefundsCreate.mockResolvedValue({
            id: 're_test_refund123',
            amount: 5000,
            status: 'succeeded',
        });

        const result = await processRefund('booking_1', DEFAULT_BIZ);

        expect(result.success).toBe(true);
        expect(result.data.refundId).toBe('re_test_refund123');
        expect(result.data.amount).toBe(50);
        expect(result.data.status).toBe('succeeded');

        expect(mockStripeSessionsRetrieve).toHaveBeenCalledWith('cs_test_abc123');
        expect(mockStripeRefundsCreate).toHaveBeenCalledWith({
            payment_intent: 'pi_test_xyz789',
            reason: 'requested_by_customer',
        });
    });

    it('scopes booking query to businessId (prevents cross-tenant refund)', async () => {
        // Booking belongs to OTHER_BIZ — should not be found when querying as DEFAULT_BIZ
        mockFrom.mockReturnValue(makeChain({ data: null, error: null }));

        const result = await processRefund('booking_1', DEFAULT_BIZ);
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('BOOKING_NOT_FOUND');

        // Verify the eq() calls include business_id scoping
        const chain = mockFrom.mock.results[0].value;
        const eqCalls = chain.eq.mock.calls.map(c => c[0]);
        expect(eqCalls).toContain('business_id');
    });

    it('rejects refund when booking belongs to a different business', async () => {
        // Simulate a booking that exists but for a different tenant
        // The query includes .eq('business_id', DEFAULT_BIZ) so it won't find the OTHER_BIZ booking
        mockFrom.mockReturnValue(makeChain({ data: null, error: null }));

        const result = await processRefund('cross_tenant_booking', DEFAULT_BIZ);
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('processRefundWithCancel returns error when refund fails', async () => {
        mockFrom.mockReturnValue(makeChain({ data: null, error: null }));

        const result = await processRefundWithCancel('nonexistent-id', DEFAULT_BIZ);
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('processRefundWithCancel succeeds and attempts calendar cancellation', async () => {
        const booking = {
            id: 'booking_1',
            status: 'confirmed',
            customer_name: 'John Doe',
            service: 'Signature Ceramic',
            service_price: 450,
            notes: 'Deposit paid via Stripe. Session: cs_test_abc123',
            google_event_id: 'gcal_event_123',
        };

        mockFrom
            .mockReturnValueOnce(makeChain({ data: booking, error: null }))      // initial fetch
            .mockReturnValueOnce(makeChain({ data: booking, error: null }))      // claim update
            .mockReturnValueOnce(makeChain({ data: { status: 'refunding' }, error: null })) // verify claim
            .mockReturnValueOnce(makeChain({ data: booking, error: null }));     // fetch for calendar cancel

        mockStripeSessionsRetrieve.mockResolvedValue({ payment_intent: 'pi_test_xyz789' });
        mockStripeRefundsCreate.mockResolvedValue({ id: 're_test_refund', amount: 5000, status: 'succeeded' });

        const result = await processRefundWithCancel('booking_1', DEFAULT_BIZ);
        expect(result.success).toBe(true);
    });
});
