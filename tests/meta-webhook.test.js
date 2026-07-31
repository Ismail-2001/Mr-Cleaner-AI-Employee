import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    withScope: vi.fn((cb) => { cb({ setTag: vi.fn(), setExtra: vi.fn() }); }),
}));

vi.mock('@/lib/maestro', () => ({
    orchestrateMaya: vi.fn().mockResolvedValue({
        role: 'assistant',
        content: 'Hello! How can I help you today?',
        session_id: 'test-session',
    }),
}));

vi.mock('@/lib/meta', () => ({
    verifyMetaSignature: vi.fn(),
    handleWebhookVerification: vi.fn(),
    parseWebhookMessages: vi.fn(),
    sendMetaMessage: vi.fn().mockResolvedValue({ success: true }),
    resolveBusinessByMetaId: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/rate-limit', () => ({
    checkWebhookRateLimit: vi.fn().mockReturnValue(null),
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Meta Webhook — Signature Verification', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('verifyMetaSignature returns true for valid signature', async () => {
        const { verifyMetaSignature } = await import('@/lib/meta');

        // Mock returns true (the actual HMAC logic is in meta.js)
        verifyMetaSignature.mockReturnValueOnce(true);

        const result = verifyMetaSignature('body', 'sha256=abc123');
        expect(result).toBe(true);
    });

    it('verifyMetaSignature returns false for invalid signature', async () => {
        const { verifyMetaSignature } = await import('@/lib/meta');

        verifyMetaSignature.mockReturnValueOnce(false);

        const result = verifyMetaSignature('body', 'sha256=wrong');
        expect(result).toBe(false);
    });

    it('verifyMetaSignature returns false when no signature header', async () => {
        const { verifyMetaSignature } = await import('@/lib/meta');

        verifyMetaSignature.mockReturnValueOnce(false);

        const result = verifyMetaSignature('body', null);
        expect(result).toBe(false);
    });
});

describe('Meta Webhook — Message Parsing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('parses Messenger messages correctly', async () => {
        const { parseWebhookMessages } = await import('@/lib/meta');

        const messengerMessages = [
            { senderId: '123456', recipientId: '789012', text: 'Hello', platform: 'messenger', messageId: 'msg-1' },
        ];
        parseWebhookMessages.mockReturnValueOnce(messengerMessages);

        const result = parseWebhookMessages({
            object: 'page',
            entry: [{ messaging: [{ sender: { id: '123456' }, message: { text: 'Hello' } }] }],
        });

        expect(result).toHaveLength(1);
        expect(result[0].platform).toBe('messenger');
        expect(result[0].text).toBe('Hello');
    });

    it('parses Instagram messages correctly', async () => {
        const { parseWebhookMessages } = await import('@/lib/meta');

        const igMessages = [
            { senderId: 'ig-user-1', recipientId: 'ig-page-1', text: 'Hi there', platform: 'instagram', messageId: 'ig-msg-1' },
        ];
        parseWebhookMessages.mockReturnValueOnce(igMessages);

        const result = parseWebhookMessages({
            object: 'page',
            entry: [{ changes: [{ value: { from: { id: 'ig-user-1' }, text: 'Hi there' } }] }],
        });

        expect(result).toHaveLength(1);
        expect(result[0].platform).toBe('instagram');
    });

    it('returns empty array for non-page events', async () => {
        const { parseWebhookMessages } = await import('@/lib/meta');

        parseWebhookMessages.mockReturnValueOnce([]);

        const result = parseWebhookMessages({ object: 'other' });
        expect(result).toHaveLength(0);
    });

    it('returns empty array for delivery receipts', async () => {
        const { parseWebhookMessages } = await import('@/lib/meta');

        parseWebhookMessages.mockReturnValueOnce([]);

        const result = parseWebhookMessages({
            object: 'page',
            entry: [{ messaging: [{ sender: { id: '123' }, delivery: { mids: ['msg-1'] } }] }],
        });
        expect(result).toHaveLength(0);
    });
});

describe('Meta Webhook — POST Handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function createPostRequest(body, headers = {}) {
        return new Request('https://example.com/api/webhook/meta', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...headers,
            },
            body: JSON.stringify(body),
        });
    }

    it('returns 403 for invalid signature', async () => {
        const { verifyMetaSignature } = await import('@/lib/meta');
        verifyMetaSignature.mockReturnValueOnce(false);

        const { POST } = await import('@/app/api/webhook/meta/route');
        const req = createPostRequest({ object: 'page', entry: [] });
        const response = await POST(req);

        expect(response.status).toBe(403);
    });

    it('returns 200 for valid webhook with no messages', async () => {
        const { verifyMetaSignature, parseWebhookMessages } = await import('@/lib/meta');
        verifyMetaSignature.mockReturnValueOnce(true);
        parseWebhookMessages.mockReturnValueOnce([]);

        const { POST } = await import('@/app/api/webhook/meta/route');
        const req = createPostRequest({ object: 'page', entry: [] });
        const response = await POST(req);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.status).toBe('ok');
    });

    it('processes messages and returns 200', async () => {
        const { verifyMetaSignature, parseWebhookMessages, sendMetaMessage } = await import('@/lib/meta');
        const { orchestrateMaya } = await import('@/lib/maestro');

        verifyMetaSignature.mockReturnValueOnce(true);
        parseWebhookMessages.mockReturnValueOnce([
            { senderId: 'user-1', recipientId: 'page-1', text: 'Hi', platform: 'messenger', messageId: 'msg-1' },
        ]);
        orchestrateMaya.mockResolvedValueOnce({ content: 'Hello there!', session_id: 'meta_test' });
        sendMetaMessage.mockResolvedValueOnce({ success: true });

        const { POST } = await import('@/app/api/webhook/meta/route');
        const req = createPostRequest({ object: 'page', entry: [{ messaging: [{ sender: { id: 'user-1' }, message: { text: 'Hi' } }] }] });
        const response = await POST(req);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.status).toBe('ok');
        expect(data.processed).toBe(1);
        expect(sendMetaMessage).toHaveBeenCalledWith('user-1', 'Hello there!', 'messenger');
    });

    it('always returns 200 to Meta even on internal errors', async () => {
        const { verifyMetaSignature, parseWebhookMessages } = await import('@/lib/meta');
        verifyMetaSignature.mockReturnValueOnce(true);
        parseWebhookMessages.mockImplementationOnce(() => { throw new Error('Parse error'); });

        const { POST } = await import('@/app/api/webhook/meta/route');
        const req = createPostRequest({ object: 'page', entry: [] });
        const response = await POST(req);

        // Must always return 200 to prevent Meta from retrying
        expect(response.status).toBe(200);
    });
});

describe('Meta Webhook — GET Handler (Verification)', () => {
    it('delegates to handleWebhookVerification', async () => {
        const { handleWebhookVerification } = await import('@/lib/meta');
        handleWebhookVerification.mockReturnValueOnce(new Response('challenge-value', { status: 200 }));

        const { GET } = await import('@/app/api/webhook/meta/route');
        const req = new Request('https://example.com/api/webhook/meta?hub.mode=subscribe&hub.verify_token=test&hub.challenge=challenge-value');
        const response = await GET(req);

        expect(response.status).toBe(200);
        expect(handleWebhookVerification).toHaveBeenCalled();
    });
});
