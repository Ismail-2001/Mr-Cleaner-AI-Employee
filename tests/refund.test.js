import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();

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

import { processRefund } from '@/lib/refund';

function makeChain(result) {
    const chain = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn().mockResolvedValue(result);
    chain.update = vi.fn(() => chain);
    return chain;
}

describe('processRefund', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns error if booking not found', async () => {
        mockFrom.mockReturnValue(makeChain({ data: null, error: null }));
        const result = await processRefund('nonexistent-id');
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('returns error if booking status is refunded', async () => {
        mockFrom.mockReturnValue(makeChain({
            data: { id: '1', status: 'refunded', notes: 'Session: cs_test_abc' },
            error: null,
        }));
        const result = await processRefund('1');
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('ALREADY_REFUNDED');
    });

    it('returns error if booking is not confirmed or pending', async () => {
        mockFrom.mockReturnValue(makeChain({
            data: { id: '1', status: 'cancelled', notes: 'Session: cs_test_abc' },
            error: null,
        }));
        const result = await processRefund('1');
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('returns error if no Stripe session ID in notes', async () => {
        mockFrom.mockReturnValue(makeChain({
            data: { id: '1', status: 'confirmed', notes: 'No session here' },
            error: null,
        }));
        const result = await processRefund('1');
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('NO_STRIPE_SESSION');
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

        mockFrom.mockReturnValue(makeChain({ data: booking, error: null }));

        mockStripeSessionsRetrieve.mockResolvedValue({
            payment_intent: 'pi_test_xyz789',
        });

        mockStripeRefundsCreate.mockResolvedValue({
            id: 're_test_refund123',
            amount: 5000,
            status: 'succeeded',
        });

        const result = await processRefund('booking_1');

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
});
