import { SignJWT, jwtVerify } from 'jose';

// SECRET_KEY must be set in env — never hardcoded. 32+ bytes required for HS256.
// Exported so middleware.js can verify cookies without duplicating the secret derivation.
// SECURITY: If the env var is missing, TextEncoder().encode(undefined) produces the
// string "undefined" (9 bytes) — a publicly guessable secret that allows forging
// valid session cookies. We fail closed instead.
const rawSecret = process.env.DASHBOARD_SESSION_SECRET;
if (!rawSecret || rawSecret.length < 32) {
    throw new Error(
        'DASHBOARD_SESSION_SECRET must be set and at least 32 characters. ' +
        'Generate one with: openssl rand -hex 32'
    );
}
export const secret = new TextEncoder().encode(rawSecret);

export const COOKIE_NAME = 'dashboard_session';
export const SESSION_DURATION_SEC = 8 * 60 * 60; // 8 hours in seconds

/**
 * Creates a signed, httpOnly session cookie value.
 * The cookie contains only a non-sensitive session ID — no password, no user data.
 * The HMAC signature prevents tampering.
 *
 * BUG FIX: exp claim must be in seconds (Unix timestamp), not milliseconds.
 * jose library validates exp as seconds — using ms would cause tokens to
 * effectively never expire (or expire ~1000x later than intended).
 */
export async function createSessionCookie() {
    const sessionId = crypto.randomUUID();
    const expires = Math.floor(Date.now() / 1000) + SESSION_DURATION_SEC;

    const token = await new SignJWT({ sid: sessionId, exp: expires })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .sign(secret);

    return {
        name: COOKIE_NAME,
        value: token,
        options: {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: SESSION_DURATION_SEC,
        },
    };
}

/**
 * Verifies the signed session cookie. Returns { valid: true, session } or
 * { valid: false }. Fails closed — any tampering, expiry, or missing cookie
 * returns invalid.
 */
export async function verifySession(cookieValue) {
    if (!cookieValue) return { valid: false };

    try {
        const { payload } = await jwtVerify(cookieValue, secret);
        // Defense-in-depth: manually check expiry even though jose does it
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            return { valid: false };
        }
        return { valid: true, session: payload };
    } catch {
        return { valid: false };
    }
}
