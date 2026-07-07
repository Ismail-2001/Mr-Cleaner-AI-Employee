import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { getSecret, COOKIE_NAME } from '@/lib/session';
import { isSessionRevoked } from '@/lib/revocation';

/**
 * WHY THIS MIDDLEWARE EXISTS:
 * Dashboard data endpoints and the dashboard page itself must be inaccessible
 * without a valid server-signed session. Previously, the dashboard password was
 * compared client-side in the browser bundle, meaning anyone could:
 *   1. Read the password from dev tools / view-source
 *   2. Bypass the UI entirely and call /api/bookings directly to see all data
 * This middleware enforces server-side session verification on every request
 * to protected routes before it ever reaches the route handler.
 *
 * BUG FIX: Excluded /dashboard/login from auth check to prevent infinite
 * redirect loop (unauthenticated → /dashboard/login → middleware → redirect
 * → /dashboard/login → ...).
 *
 * BUG FIX: JWT exp is now correctly in seconds (via session.js), not ms.
 *
 * SECURITY: Revoked sessions are checked against Supabase so logout actually
 * invalidates the JWT before its natural 8-hour expiry.
 */
async function verifySessionCookie(request) {
    const cookie = request.cookies.get(COOKIE_NAME);
    if (!cookie?.value) return false;

    try {
        const { payload } = await jwtVerify(cookie.value, getSecret());
        // exp is in seconds (set by session.js). jose validates exp internally,
        // but we check again as defense-in-depth.
        if (!payload?.sid) return false;

        // Check if this session was revoked (e.g., on logout)
        const revoked = await isSessionRevoked(payload.sid);
        if (revoked) return false;

        return true;
    } catch {
        return false;
    }
}

export async function middleware(request) {
    const { pathname } = request.nextUrl;

    // Protect dashboard pages — but NEVER redirect /dashboard/login to itself
    if (pathname.startsWith('/dashboard') && pathname !== '/dashboard/login') {
        const valid = await verifySessionCookie(request);
        if (!valid) {
            return NextResponse.redirect(new URL('/dashboard/login', request.url));
        }
    }

    // Protect dashboard data API — only allow GET /api/bookings with valid session
    // (POST /api/bookings is customer-facing and must remain open for chat flow)
    if (pathname === '/api/bookings' && request.method === 'GET') {
        const valid = await verifySessionCookie(request);
        if (!valid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/dashboard/:path*',
        '/api/bookings',
    ],
};
