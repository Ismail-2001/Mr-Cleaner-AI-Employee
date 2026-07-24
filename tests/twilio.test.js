import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockMessagesCreate = vi.fn();

vi.mock('twilio', () => ({
    default: vi.fn(() => ({
        messages: { create: mockMessagesCreate },
    })),
}));

vi.mock('@/lib/supabase-admin', () => ({
    supabaseAdmin: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            limit: vi.fn().mockReturnValue({
                                single: vi.fn().mockResolvedValue({ data: null }),
                            }),
                        }),
                    }),
                }),
            }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
    },
}));

vi.mock('resend', () => ({
    Resend: vi.fn(() => ({
        emails: { send: vi.fn().mockResolvedValue({ data: { id: 'email-1' } }) },
    })),
}));

process.env.TWILIO_ACCOUNT_SID = 'AC_test_sid';
process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
process.env.TWILIO_PHONE_NUMBER = '+15550009999';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('sendSMS', () => {
    beforeEach(() => {
        mockMessagesCreate.mockReset();
    });

    it('sends SMS successfully on first attempt', async () => {
        mockMessagesCreate.mockResolvedValueOnce({ sid: 'SM-123' });

        const { sendSMS } = await import('@/lib/twilio');
        const result = await sendSMS('+15551234567', 'Test message');

        expect(result.success).toBe(true);
        expect(result.sid).toBe('SM-123');
        expect(result.attempts).toBe(1);
        expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    });

    it('retries on transient failure and succeeds', async () => {
        vi.useFakeTimers();

        mockMessagesCreate
            .mockRejectedValueOnce({ message: 'Too Many Requests', code: 20429, status: 429 })
            .mockRejectedValueOnce({ message: 'Too Many Requests', code: 20429, status: 429 })
            .mockResolvedValueOnce({ sid: 'SM-456' });

        const { sendSMS } = await import('@/lib/twilio');
        const promise = sendSMS('+15551234567', 'Test message');

        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(2000);

        const result = await promise;

        expect(result.success).toBe(true);
        expect(result.attempts).toBe(3);
        expect(mockMessagesCreate).toHaveBeenCalledTimes(3);

        vi.useRealTimers();
    });

    it('fails after max retries exhausted', async () => {
        vi.useFakeTimers();

        mockMessagesCreate
            .mockRejectedValueOnce({ message: 'Server error', code: 0, status: 500 })
            .mockRejectedValueOnce({ message: 'Server error', code: 0, status: 500 })
            .mockRejectedValueOnce({ message: 'Server error', code: 0, status: 500 });

        const { sendSMS } = await import('@/lib/twilio');
        const promise = sendSMS('+15551234567', 'Test message');

        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(2000);

        const result = await promise;

        expect(result.success).toBe(false);
        expect(result.attempts).toBe(3);
        expect(mockMessagesCreate).toHaveBeenCalledTimes(3);

        vi.useRealTimers();
    });

    it('does NOT retry on non-retryable error (invalid number)', async () => {
        mockMessagesCreate.mockRejectedValueOnce({
            message: 'Invalid number',
            code: 21211,
            status: 400,
        });

        const { sendSMS } = await import('@/lib/twilio');
        const result = await sendSMS('+15550000000', 'Test');

        expect(result.success).toBe(false);
        expect(result.attempts).toBe(1);
        expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    });

    it('does NOT retry on unsubscribed error', async () => {
        mockMessagesCreate.mockRejectedValueOnce({
            message: 'Unsubscribed',
            code: 21614,
            status: 400,
        });

        const { sendSMS } = await import('@/lib/twilio');
        const result = await sendSMS('+15550000000', 'Test');

        expect(result.success).toBe(false);
        expect(result.attempts).toBe(1);
    });
});

describe('sendSMSWithFallback', () => {
    beforeEach(() => {
        mockMessagesCreate.mockReset();
    });

    it('returns SMS result when SMS succeeds', async () => {
        mockMessagesCreate.mockResolvedValueOnce({ sid: 'SM-fallback-1' });

        const { sendSMSWithFallback } = await import('@/lib/twilio');
        const result = await sendSMSWithFallback('+15551234567', 'Test', {
            fallbackEmail: 'test@example.com',
        });

        expect(result.method).toBe('sms');
        expect(result.success).toBe(true);
    });
});

describe('triggerLeadAlerts — TCPA consent gate', () => {
    beforeEach(() => {
        mockMessagesCreate.mockReset();
    });

    it('skips customer SMS when sms_consent is false', async () => {
        const { triggerLeadAlerts } = await import('@/lib/twilio');

        const booking = {
            customer_name: 'Test Customer',
            phone: '+15551234567',
            vehicle_type: 'SUV',
            service: 'Premium Detail',
            service_price: 225,
            booking_date: '2026-08-01',
            booking_time: '10:00 AM',
            lead_score: 90,
            sms_consent: false,
        };

        const result = await triggerLeadAlerts(booking);

        expect(result.customer.method).toBe('skipped');
        expect(result.customer.reason).toBe('no_sms_consent');
    });

    it('skips customer SMS when sms_consent is undefined', async () => {
        const { triggerLeadAlerts } = await import('@/lib/twilio');

        const booking = {
            customer_name: 'Test Customer',
            phone: '+15551234567',
            vehicle_type: 'SUV',
            service: 'Premium Detail',
            service_price: 225,
            booking_date: '2026-08-01',
            booking_time: '10:00 AM',
            lead_score: 90,
        };

        const result = await triggerLeadAlerts(booking);

        expect(result.customer.method).toBe('skipped');
        expect(result.customer.reason).toBe('no_sms_consent');
    });

    it('sends customer SMS when sms_consent is true', async () => {
        mockMessagesCreate.mockResolvedValueOnce({ sid: 'SM-consent-1' });

        const { triggerLeadAlerts } = await import('@/lib/twilio');

        const booking = {
            customer_name: 'Test Customer',
            phone: '+15551234567',
            vehicle_type: 'SUV',
            service: 'Premium Detail',
            service_price: 225,
            booking_date: '2026-08-01',
            booking_time: '10:00 AM',
            lead_score: 90,
            sms_consent: true,
        };

        const result = await triggerLeadAlerts(booking);

        expect(result.customer.success).toBe(true);
        expect(result.customer.sid).toBe('SM-consent-1');
    });

    it('owner SMS succeeds via Twilio mock', async () => {
        mockMessagesCreate.mockResolvedValueOnce({ sid: 'SM-owner-1' });
        process.env.BUSINESS_PHONE = '+15550001234';

        const { triggerLeadAlerts } = await import('@/lib/twilio');

        const booking = {
            customer_name: 'Test Customer',
            phone: '+15551234567',
            vehicle_type: 'SUV',
            service: 'Premium Detail',
            service_price: 225,
            booking_date: '2026-08-01',
            booking_time: '10:00 AM',
            lead_score: 50,
        };

        const result = await triggerLeadAlerts(booking);

        expect(result.owner.method).toBe('sms');
        expect(result.owner.success).toBe(true);
        expect(result.owner.sid).toBe('SM-owner-1');
    });
});

describe('hasSmsConsent', () => {
    beforeEach(() => {
        mockMessagesCreate.mockReset();
    });

    it('returns false when no consent record exists', async () => {
        const { hasSmsConsent } = await import('@/lib/twilio');
        const result = await hasSmsConsent('+15551234567', '00000000-0000-0000-0000-000000000001');

        expect(result).toBe(false);
    });
});
