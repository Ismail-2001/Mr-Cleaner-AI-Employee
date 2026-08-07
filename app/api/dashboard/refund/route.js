import { requireSession } from '@/lib/session';
import { processRefund } from '@/lib/refund';
import { DEFAULT_BUSINESS_ID } from '@/lib/tenant';
import { log } from '@/lib/logger';

/**
 * POST /api/dashboard/refund
 *
 * Issues a Stripe refund for a booking and updates its status to 'refunded'.
 * Only the dashboard owner (authenticated via session cookie) can call this.
 *
 * SECURITY: businessId is passed to processRefund() to scope the booking query.
 * The booking must belong to this business — prevents cross-tenant refund attacks.
 * Currently single-tenant (DEFAULT_BUSINESS_ID); future multi-tenant dashboards
 * will resolve from session/JWT claim.
 *
 * Body: { bookingId: string }
 */
export async function POST(req) {
    const requestId = crypto.randomUUID();

    const { response } = await requireSession(req);
    if (response) return response;

    try {
        const body = await req.json();
        const { bookingId } = body || {};

        if (!bookingId || typeof bookingId !== 'string') {
            return Response.json(
                { error: { code: 'INVALID_REQUEST', message: 'bookingId is required', request_id: requestId } },
                { status: 400 }
            );
        }

        // Business scope — booking must belong to this business (prevents cross-tenant refund)
        const businessId = DEFAULT_BUSINESS_ID;

        log.info('refund', 'Processing refund', { requestId, bookingId, businessId });

        const result = await processRefund(bookingId, businessId);

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
        log.error('refund', 'Refund endpoint error', { requestId, error: error.message });
        return Response.json(
            { error: { code: 'INTERNAL_ERROR', message: 'Failed to process refund', request_id: requestId } },
            { status: 500 }
        );
    }
}
