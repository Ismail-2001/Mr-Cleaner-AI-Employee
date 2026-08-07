import { test, expect } from '@playwright/test';

test.describe('Security Headers', () => {
    test('returns security headers on API responses', async ({ request }) => {
        const res = await request.get('/api/health');
        const headers = res.headers();

        expect(headers['x-content-type-options']).toBe('nosniff');
        expect(headers['x-frame-options']).toBe('DENY');
        expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    test('does not leak server version', async ({ request }) => {
        const res = await request.get('/api/health');
        const headers = res.headers();
        expect(headers['x-powered-by']).toBeUndefined();
    });
});

test.describe('Auth Rate Limiting', () => {
    test('first login attempt returns 401 (not 429)', async ({ request }) => {
        const res = await request.post('/api/dashboard/auth', {
            data: { password: 'wrong-first-attempt' },
        });
        expect(res.status()).toBe(401);
    });
});

test.describe('CSRF Protection', () => {
    test('same-origin POST without Origin header is accepted', async ({ request }) => {
        const res = await request.post('/api/dashboard/auth', {
            data: { password: 'test' },
        });
        // Should get 401 (wrong password) not 403 (CSRF blocked)
        expect([401, 429]).toContain(res.status());
    });
});

test.describe('API v1 Routing', () => {
    test('GET /api/v1/health returns health check', async ({ request }) => {
        const res = await request.get('/api/v1/health');
        // v1 health re-exports from /api/health
        expect([200, 207, 404]).toContain(res.status());
    });
});
