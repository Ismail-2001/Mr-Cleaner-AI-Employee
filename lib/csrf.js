/**
 * CSRF Protection via Origin/Referer header validation.
 *
 * WHY THIS EXISTS:
 * Cross-Site Request Forgery attacks trick a user's browser into making
 * unwanted requests to a site where they're authenticated. For our dashboard
 * (JWT cookie auth), a malicious site could craft a form that POSTs to our
 * booking endpoint. Origin/Referer checks ensure requests come from our own domain.
 *
 * LIMITATION: This is a defense-in-depth measure. It doesn't replace SameSite
 * cookies (which we already use) but adds an extra layer for older browsers.
 */

const ALLOWED_ORIGINS = [
    process.env.NEXT_PUBLIC_APP_URL,
    'http://localhost:3000',
    'http://localhost:3001',
].filter(Boolean);

/**
 * Validates that a request originates from our domain.
 * Returns null if valid, or a Response object if rejected.
 */
export function validateCsrf(request) {
    // Stripe webhooks don't send Origin/Referer — skip CSRF check
    const url = new URL(request.url);
    if (url.pathname === '/api/stripe/webhook') return null;

    // Only protect state-changing methods
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
        return null;
    }

    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');

    // Check Origin header first (most reliable)
    if (origin) {
        try {
            const originUrl = new URL(origin);
            const isAllowed = ALLOWED_ORIGINS.some(allowed => {
                const allowedUrl = new URL(allowed);
                return originUrl.hostname === allowedUrl.hostname;
            });
            if (!isAllowed) {
                return Response.json(
                    { error: { code: 'CSRF_REJECTED', message: 'Request origin not allowed' } },
                    { status: 403 }
                );
            }
            return null;
        } catch {
            return Response.json(
                { error: { code: 'CSRF_REJECTED', message: 'Invalid origin header' } },
                { status: 403 }
            );
        }
    }

    // Fallback to Referer header
    if (referer) {
        try {
            const refererUrl = new URL(referer);
            const isAllowed = ALLOWED_ORIGINS.some(allowed => {
                const allowedUrl = new URL(allowed);
                return refererUrl.hostname === allowedUrl.hostname;
            });
            if (!isAllowed) {
                return Response.json(
                    { error: { code: 'CSRF_REJECTED', message: 'Request referer not allowed' } },
                    { status: 403 }
                );
            }
            return null;
        } catch {
            return Response.json(
                { error: { code: 'CSRF_REJECTED', message: 'Invalid referer header' } },
                { status: 403 }
            );
        }
    }

    // No Origin or Referer — could be a direct API call (Postman, curl).
    // Allow it for now (rate limiting catches abuse). In strict mode,
    // you'd reject here.
    return null;
}
