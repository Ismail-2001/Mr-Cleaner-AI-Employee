import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    withScope: vi.fn((cb) => { cb({ setTag: vi.fn(), setExtra: vi.fn() }); }),
}));

vi.mock('@/lib/maestro', () => ({
    orchestrateMaya: vi.fn().mockResolvedValue({
        role: 'assistant',
        content: 'Thank you for your feedback!',
        session_id: 'test-session',
    }),
}));

vi.mock('@/lib/gbp', () => ({
    verifyGoogleWebhook: vi.fn(),
    parseGbpNotification: vi.fn(),
    replyToReview: vi.fn().mockResolvedValue({ success: true }),
    generateReviewReply: vi.fn().mockReturnValue('Thank you for the review!'),
    resolveBusinessByGbpLocation: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/jobber', () => ({
    getJobberAuthUrl: vi.fn().mockReturnValue('https://get.jobber.com/auth?client_id=test'),
    exchangeJobberCode: vi.fn(),
    refreshJobberToken: vi.fn(),
    verifyJobberWebhook: vi.fn(),
    parseJobberEvent: vi.fn(),
    syncBookingToJobber: vi.fn(),
    createJobberClient: vi.fn(),
    createJobberJob: vi.fn(),
    searchJobberClients: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
    checkWebhookRateLimit: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/redis', () => ({
    getRedisClient: vi.fn().mockReturnValue(null),
    tryRedisOp: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/supabase-admin', () => {
    const singleMock = vi.fn().mockResolvedValue({ data: null });
    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

    return {
        supabaseAdmin: {
            from: vi.fn(() => ({
                select: selectMock,
                upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
                insert: vi.fn().mockResolvedValue({ data: null, error: null }),
                update: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
                delete: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
            })),
        },
    };
});

// ─── GBP Webhook Tests ──────────────────────────────────────────────────────

describe('GBP Webhook — POST Handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function createGoogleRequest(body) {
        return new Request('https://example.com/api/webhook/google', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    it('returns 403 for invalid webhook signature', async () => {
        const { verifyGoogleWebhook } = await import('@/lib/gbp');
        verifyGoogleWebhook.mockReturnValueOnce(false);

        const { POST } = await import('@/app/api/webhook/google/route');
        const req = createGoogleRequest({ message: { data: 'test' } });
        const response = await POST(req);

        expect(response.status).toBe(403);
    });

    it('returns 200 for valid review notification', async () => {
        const { verifyGoogleWebhook, parseGbpNotification } = await import('@/lib/gbp');
        verifyGoogleWebhook.mockReturnValueOnce(true);
        parseGbpNotification.mockReturnValueOnce({
            type: 'review',
            reviewId: 'review-1',
            locationId: 'loc-1',
            authorName: 'John',
            starRating: 5,
            comment: 'Great service!',
        });

        const { POST } = await import('@/app/api/webhook/google/route');
        const req = createGoogleRequest({ message: { data: Buffer.from(JSON.stringify({ token: 'test' })).toString('base64') } });
        const response = await POST(req);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.event_type).toBe('review');
    });

    it('always returns 200 to prevent Google retries on error', async () => {
        const { verifyGoogleWebhook, parseGbpNotification } = await import('@/lib/gbp');
        verifyGoogleWebhook.mockReturnValueOnce(true);
        parseGbpNotification.mockImplementationOnce(() => { throw new Error('Parse error'); });

        const { POST } = await import('@/app/api/webhook/google/route');
        const req = createGoogleRequest({ message: { data: 'corrupt' } });
        const response = await POST(req);

        expect(response.status).toBe(200);
    });
});

// ─── GBP Message Parsing Tests ───────────────────────────────────────────────

describe('GBP Notification Parsing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('parses review notifications', async () => {
        const { parseGbpNotification } = await import('@/lib/gbp');

        const event = {
            type: 'review',
            reviewId: 'rev-123',
            locationId: 'loc-456',
            authorName: 'Jane',
            starRating: 4,
            comment: 'Excellent work!',
        };
        parseGbpNotification.mockReturnValueOnce(event);

        const result = parseGbpNotification({
            message: { data: Buffer.from(JSON.stringify({ type: 'NEW_REVIEW' })).toString('base64') },
        });

        expect(result.type).toBe('review');
        expect(result.starRating).toBe(4);
    });

    it('parses Q&A notifications', async () => {
        const { parseGbpNotification } = await import('@/lib/gbp');

        const event = {
            type: 'question',
            questionId: 'q-1',
            locationId: 'loc-1',
            text: 'Do you offer ceramic coating?',
        };
        parseGbpNotification.mockReturnValueOnce(event);

        const result = parseGbpNotification({
            message: { data: Buffer.from(JSON.stringify({ type: 'NEW_QUESTION' })).toString('base64') },
        });

        expect(result.type).toBe('question');
        expect(result.text).toContain('ceramic coating');
    });

    it('returns null for unparseable notifications', async () => {
        const { parseGbpNotification } = await import('@/lib/gbp');
        parseGbpNotification.mockReturnValueOnce(null);

        const result = parseGbpNotification({ message: { data: 'corrupt' } });
        expect(result).toBeNull();
    });
});

// ─── Jobber OAuth Tests ──────────────────────────────────────────────────────

describe('Jobber Integration — OAuth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('generates auth URL with correct parameters', async () => {
        const { getJobberAuthUrl } = await import('@/lib/jobber');
        getJobberAuthUrl.mockReturnValueOnce('https://get.jobber.com/appcenter/oauth/authorize?client_id=test');

        const { GET } = await import('@/app/api/integrations/jobber/route');
        const req = new Request('https://example.com/api/integrations/jobber');
        const response = await GET(req);

        // Should redirect to Jobber auth URL
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toContain('get.jobber.com');
    });

    it('health check returns configured status', async () => {
        const { GET } = await import('@/app/api/integrations/jobber/route');
        const req = new Request('https://example.com/api/integrations/jobber?action=health');
        const response = await GET(req);
        const data = await response.json();

        expect(data.provider).toBe('jobber');
        expect(typeof data.configured).toBe('boolean');
    });
});

// ─── Jobber Webhook Tests ────────────────────────────────────────────────────

describe('Jobber Webhook — POST Handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 403 for invalid signature', async () => {
        const { verifyJobberWebhook } = await import('@/lib/jobber');
        verifyJobberWebhook.mockReturnValueOnce(false);

        const { POST } = await import('@/app/api/integrations/jobber/route');
        const req = new Request('https://example.com/api/integrations/jobber/webhook', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-jobber-signature': 'sha256=wrong' },
            body: JSON.stringify({ event: 'job.created', data: { job: { id: '1' } } }),
        });
        const response = await POST(req);

        expect(response.status).toBe(403);
    });

    it('processes valid job update event', async () => {
        const { verifyJobberWebhook, parseJobberEvent } = await import('@/lib/jobber');
        verifyJobberWebhook.mockReturnValueOnce(true);
        parseJobberEvent.mockReturnValueOnce({
            type: 'job_update',
            jobId: 'job-1',
            status: 'completed',
            action: 'job.updated',
        });

        const { POST } = await import('@/app/api/integrations/jobber/route');
        const req = new Request('https://example.com/api/integrations/jobber/webhook', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-jobber-signature': 'sha256=valid' },
            body: JSON.stringify({ event: 'job.updated', data: { job: { id: 'job-1', status: 'completed' } } }),
        });
        const response = await POST(req);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.event_type).toBe('job_update');
    });

    it('always returns 200 to prevent retries on error', async () => {
        const { verifyJobberWebhook, parseJobberEvent } = await import('@/lib/jobber');
        verifyJobberWebhook.mockReturnValueOnce(true);
        parseJobberEvent.mockImplementationOnce(() => { throw new Error('Parse error'); });

        const { POST } = await import('@/app/api/integrations/jobber/route');
        const req = new Request('https://example.com/api/integrations/jobber/webhook', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-jobber-signature': 'sha256=valid' },
            body: 'corrupt',
        });
        const response = await POST(req);

        expect(response.status).toBe(200);
    });
});
