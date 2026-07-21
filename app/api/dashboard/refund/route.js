import { verifySession, COOKIE_NAME } from '@/lib/session';
import { processRefund } from '@/lib/refund';

/**
 * POST /api/dashboard/refund
 *
 * Issues a Stripe refund for a booking and updates its status to 'refunded'.
 * Only the dashboard owner (authenticated via session cookie) can call this.
 *
 * Body: { bookingId: string }
 */
export async function POST(req) {
    const requestId = crypto.randomUUID();

    // AUTH: Verify dashboard session cookie.
    // The middleware only protects GET /api/dashboard — POST needs explicit check.
    const cookie = req.cookies.get(COOKIE_NAME);
    const { valid } = await verifySession(cookie?.value);
    if (!valid) {
        return Response.json(
            { error: { code: 'UNAUTHORIZED', message: 'Dashboard session required', request_id: requestId } },
            { status: 401 }
        );
    }

    try {
        const body = await req.json();
        const { bookingId } = body || {};

        if (!bookingId || typeof bookingId !== 'string') {
            return Response.json(
                { error: { code: 'INVALID_REQUEST', message: 'bookingId is required', request_id: requestId } },
                { status: 400 }
            );
        }

        console.log(`[${requestId}] Processing refund for booking: ${bookingId}`);

        const result = await processRefund(bookingId);

        if (!result.success) {
            const statusMap = {
                BOOKING_NOT_FOUND: 404,
                ALREADY_REFUNDED: 409,
                INVALID_STATUS: 422,
                NO_STRIPE_SESSION: 404,
                NO_PAYMENT_INTENT: 404,
                STRIPE_NOT_CONFIGURED: 503,
                DB_NOT_CONFIGURED: 503,
            };
            const status = statusMap[result.error.code] || 500;

            return Response.json({
                error: { ...result.error, request_id: requestId },
            }, { status });
        }

        return Response.json({ success: true, data: result.data, request_id: requestId });
    } catch (error) {
        console.error(`[${requestId}] Refund endpoint error:`, error.message);
        return Response.json(
            { error: { code: 'INTERNAL_ERROR', message: 'Failed to process refund', request_id: requestId } },
            { status: 500 }
        );
    }
}
