import { test, expect } from '@playwright/test';
import { DASHBOARD_PASSWORD } from './env.js';

test.describe('Bookings API — GET /api/bookings', () => {
    test('returns 401 without session', async ({ request }) => {
        const res = await request.get('/api/bookings');
        expect(res.status()).toBe(401);
    });

    test('returns 401 for availability check without session', async ({ request }) => {
        const res = await request.get('/api/bookings?date=2026-12-15');
        expect(res.status()).toBe(401);
    });
});

test.describe('Bookings API — POST /api/bookings', () => {
    test('returns 401 without session', async ({ request }) => {
        const res = await request.post('/api/bookings', {
            data: {
                customer_name: 'E2E Test',
                phone: '+1507477804',
                service: 'Executive Preservation',
                vehicle_type: 'sedan',
                booking_date: '2026-12-01',
                booking_time: '10:00',
            },
        });
        expect(res.status()).toBe(401);
    });
});

test.describe('Bookings API — Authenticated Flow', () => {
    let sessionCookie = '';

    test.beforeAll(async ({ request }) => {
        const authRes = await request.post('/api/dashboard/auth', {
            data: { password: DASHBOARD_PASSWORD },
        });
        if (authRes.status() === 200) {
            const setCookie = authRes.headers()['set-cookie'] || '';
            sessionCookie = setCookie.split(';')[0];
        }
    });

    test('returns bookings list with valid session', async ({ request }) => {
        if (!sessionCookie) {
            test.skip();
            return;
        }
        const res = await request.get('/api/bookings', {
            headers: { 'Cookie': sessionCookie },
        });
        expect(res.status()).toBe(200);

        const body = await res.json();
        expect(body).toHaveProperty('bookings');
        expect(Array.isArray(body.bookings)).toBeTruthy();
    });

    test('returns availability with valid session', async ({ request }) => {
        if (!sessionCookie) {
            test.skip();
            return;
        }
        const res = await request.get('/api/bookings?date=2026-12-15', {
            headers: { 'Cookie': sessionCookie },
        });
        expect(res.status()).toBe(200);

        const body = await res.json();
        expect(body).toHaveProperty('availability');
    });
});
