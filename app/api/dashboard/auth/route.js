import { createSessionCookie } from '@/lib/session';
import { timingSafeEqual } from 'crypto';
import { validateBody, AuthRequestSchema } from '@/lib/api-validation';

/**
 * POST /api/dashboard/auth — Server-side password validation.
 *
 * The old code compared the password in client-side JS (`if (password === 'cleaner2026')`),
 * which meant anyone could read the password from dev tools or bypass the check entirely
 * by calling the data-fetching endpoints directly. This route validates the password
 * server-side and issues a signed, httpOnly session cookie.
 */
export async function POST(req) {
    const requestId = crypto.randomUUID();
    try {
        // REQUEST VALIDATION: Reject malformed or oversized payloads.
        const body = await req.json();
        const validation = validateBody(AuthRequestSchema, body);
        if (!validation.success) {
            console.log(`[${requestId}] Auth validation failed`);
            return validation.response;
        }
        const { password } = validation.data;

        // Validate against server-side env var. NEVER hardcode secrets.
        const expectedPassword = process.env.DASHBOARD_PASSWORD;
        if (!expectedPassword) {
            console.error(`[${requestId}] DASHBOARD_PASSWORD env var not set`);
            return Response.json(
                { error: { code: 'SERVER_CONFIG', message: 'Server configuration error', request_id: requestId } },
                { status: 500 }
            );
        }

        if (!process.env.DASHBOARD_SESSION_SECRET) {
            console.error(`[${requestId}] DASHBOARD_SESSION_SECRET env var not set`);
            return Response.json(
                { error: { code: 'SERVER_CONFIG', message: 'Server configuration error', request_id: requestId } },
                { status: 500 }
            );
        }

        // Timing-safe comparison to prevent timing side-channel attacks.
        // SECURITY: Both buffers must be the exact same length. If the user's
        // password is longer than expected, Buffer.copy() would silently truncate
        // it, and timingSafeEqual would only compare the first N characters —
        // allowing any password that starts with the correct one to pass.
        const expectedBuf = Buffer.from(expectedPassword);
        const inputBuf = Buffer.from(password);
        if (expectedBuf.length !== inputBuf.length) {
            console.log(`[${requestId}] Invalid login attempt (wrong length)`);
            return Response.json(
                { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials', request_id: requestId } },
                { status: 401 }
            );
        }
        const isValid = timingSafeEqual(inputBuf, expectedBuf);

        if (!isValid) {
            console.log(`[${requestId}] Invalid login attempt`);
            return Response.json(
                { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials', request_id: requestId } },
                { status: 401 }
            );
        }

        // Password valid — issue signed session cookie
        const cookie = await createSessionCookie();
        console.log(`[${requestId}] Successful login`);

        return Response.json(
            { success: true },
            {
                status: 200,
                headers: {
                    'Set-Cookie': `${cookie.name}=${cookie.value}; Path=${cookie.options.path}; HttpOnly; SameSite=${cookie.options.sameSite}; Max-Age=${cookie.options.maxAge}${cookie.options.secure ? '; Secure' : ''}`,
                },
            }
        );
    } catch (error) {
        console.error(`[${requestId}] Dashboard auth error:`, error.message);
        return Response.json(
            { error: { code: 'AUTH_FAILED', message: 'Authentication failed', request_id: requestId } },
            { status: 500 }
        );
    }
}
