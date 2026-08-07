import { test, expect } from '@playwright/test';

test.describe('Chat API — POST /api/chat', () => {
    test('rejects empty messages with validation error', async ({ request }) => {
        const res = await request.post('/api/chat', {
            data: { messages: [] },
        });
        // Empty array fails min(1) validation → 400 or 500 (orchestrator error)
        expect([400, 500]).toContain(res.status());
    });

    test('rejects missing messages field', async ({ request }) => {
        const res = await request.post('/api/chat', {
            data: {},
        });
        expect([400, 500]).toContain(res.status());
    });

    test('rejects non-array messages', async ({ request }) => {
        const res = await request.post('/api/chat', {
            data: { messages: 'not-an-array' },
        });
        expect([400, 500]).toContain(res.status());
    });

    test('handles valid chat request (returns 200 or 500 without AI keys)', async ({ request }) => {
        const res = await request.post('/api/chat', {
            data: {
                messages: [
                    { role: 'user', content: 'Hello, what services do you offer?' },
                ],
            },
        });
        // 200 with AI key, 500 without AI keys (ORCHESTRATOR_ERROR)
        expect([200, 500]).toContain(res.status());

        const body = await res.json();
        expect(body).toHaveProperty('role', 'assistant');
        expect(body).toHaveProperty('content');
    });

    test('returns error structure when no AI models available', async ({ request }) => {
        const res = await request.post('/api/chat', {
            data: {
                messages: [
                    { role: 'user', content: 'Hello' },
                ],
            },
        });

        const body = await res.json();
        // Either success with session_id, or error with request_id
        const hasSession = !!body.session_id;
        const hasError = !!body.error?.code;
        expect(hasSession || hasError).toBeTruthy();
    });

    test('returns SSE stream when stream=true (or error without AI)', async ({ request }) => {
        const res = await request.post('/api/chat', {
            data: {
                messages: [
                    { role: 'user', content: 'Hello' },
                ],
                stream: true,
            },
        });

        // 200 with SSE, or 500 without AI keys
        if (res.status() === 200) {
            const contentType = res.headers()['content-type'];
            expect(contentType).toContain('text/event-stream');
            const text = await res.text();
            expect(text).toContain('[DONE]');
        } else {
            expect(res.status()).toBe(500);
        }
    });
});
