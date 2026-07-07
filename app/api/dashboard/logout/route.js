import { COOKIE_NAME } from '@/lib/session';
import { revokeSession } from '@/lib/revocation';

/**
 * POST /api/dashboard/logout — Clears the session cookie and revokes the JWT.
 */
export async function POST(req) {
    const requestId = crypto.randomUUID();

    // Extract session ID from the JWT cookie before clearing it
    const cookie = req.cookies.get(COOKIE_NAME);
    let sessionId = null;
    if (cookie?.value) {
        try {
            // Decode JWT payload (no verification needed — we just need the sid)
            const payload = JSON.parse(atob(cookie.value.split('.')[1]));
            sessionId = payload.sid;
        } catch {
            // Invalid token — nothing to revoke
        }
    }

    // Revoke the session server-side so the JWT can't be reused
    if (sessionId) {
        await revokeSession(sessionId);
    }

    console.log(`[${requestId}] Dashboard logout`);

    const isProduction = process.env.NODE_ENV === 'production';
    return Response.json(
        { success: true },
        {
            status: 200,
            headers: {
                'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction ? '; Secure' : ''}`,
            },
        }
    );
}
