import { test, expect } from '@playwright/test';

test.describe('Health Check — GET /api/health', () => {
    test('returns 200 with status field', async ({ request }) => {
        const res = await request.get('/api/health');
        expect(res.ok()).toBeTruthy();

        const body = await res.json();
        expect(body).toHaveProperty('status');
        expect(body).toHaveProperty('timestamp');
        expect(body).toHaveProperty('uptime_sec');
        expect(body).toHaveProperty('response_time_ms');
        expect(body.response_time_ms).toBeGreaterThanOrEqual(0);
    });

    test('returns no-cache headers', async ({ request }) => {
        const res = await request.get('/api/health');
        const cacheControl = res.headers()['cache-control'];
        expect(cacheControl).toContain('no-cache');
    });

    test('does not leak sensitive config', async ({ request }) => {
        const res = await request.get('/api/health');
        const body = await res.json();
        const text = JSON.stringify(body);

        expect(text).not.toContain('SUPABASE');
        expect(text).not.toContain('STRIPE');
        expect(text).not.toContain('API_KEY');
        expect(text).not.toContain('password');
    });
});

test.describe('Health Check — POST /api/health (verbose)', () => {
    test('returns 401 without auth token', async ({ request }) => {
        const res = await request.post('/api/health');
        expect(res.status()).toBe(401);
    });

    test('returns 401 with invalid token', async ({ request }) => {
        const res = await request.post('/api/health', {
            headers: { 'Authorization': 'Bearer invalid-token' },
        });
        expect(res.status()).toBe(401);
    });

    test('returns 200 with valid admin token', async ({ request }) => {
        const res = await request.post('/api/health', {
            headers: { 'Authorization': 'Bearer e2e-test-password-12345' },
        });
        expect([200, 207]).toContain(res.status());

        const body = await res.json();
        expect(body).toHaveProperty('status');
        expect(body).toHaveProperty('ai_providers');
        expect(body).toHaveProperty('integrations');
    });
});
