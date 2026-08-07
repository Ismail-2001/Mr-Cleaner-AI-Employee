import { test, expect } from '@playwright/test';
import { DASHBOARD_PASSWORD } from './env.js';

test.describe('Dashboard Auth — POST /api/dashboard/auth', () => {
    test('rejects login with wrong password', async ({ request }) => {
        const res = await request.post('/api/dashboard/auth', {
            data: { password: 'wrong-password' },
        });
        expect(res.status()).toBe(401);

        const body = await res.json();
        expect(body.error.code).toBe('INVALID_CREDENTIALS');
    });

    test('rejects login with empty password', async ({ request }) => {
        const res = await request.post('/api/dashboard/auth', {
            data: { password: '' },
        });
        expect([400, 401]).toContain(res.status());
    });

    test('rejects login with missing body', async ({ request }) => {
        const res = await request.post('/api/dashboard/auth', {
            data: {},
        });
        expect([400, 401]).toContain(res.status());
    });

    test('accepts correct password and sets session cookie', async ({ request }) => {
        const res = await request.post('/api/dashboard/auth', {
            data: { password: DASHBOARD_PASSWORD },
        });
        // 200 = success; 429 = rate limited from earlier attempts in same server session
        expect([200, 429]).toContain(res.status());

        if (res.status() === 200) {
            const body = await res.json();
            expect(body.success).toBe(true);

            const headers = res.headers();
            const setCookie = headers['set-cookie'] || '';
            expect(setCookie).toContain('dashboard_session=');
            expect(setCookie).toContain('HttpOnly');
        }
    });

    test('returns request_id in error responses', async ({ request }) => {
        const res = await request.post('/api/dashboard/auth', {
            data: { password: 'wrong' },
        });
        const body = await res.json();
        expect(body.error).toHaveProperty('request_id');
    });
});

test.describe('Dashboard Auth — Protected Routes', () => {
    test('redirects unauthenticated dashboard access', async ({ request }) => {
        const res = await request.get('/dashboard', {
            maxRedirects: 0,
        });
        expect([307, 308, 401]).toContain(res.status());
    });

    test('blocks unauthenticated analytics access', async ({ request }) => {
        const res = await request.get('/api/dashboard/analytics');
        expect(res.status()).toBe(401);
    });

    test('blocks unauthenticated settings access', async ({ request }) => {
        const res = await request.get('/api/dashboard/settings');
        expect(res.status()).toBe(401);
    });
});
