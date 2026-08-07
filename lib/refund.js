import * as Sentry from '@sentry/nextjs';
import { stripe } from './stripe';
import { supabaseAdmin } from './supabase-admin';
import { isConfigured as lsConfigured, createRefund as lsCreateRefund } from './lemon-squeezy';
import { log } from './logger';

function extractPaymentInfo(booking) {
    const notes = booking?.notes || '';

    // LemonSqueezy: notes contain "Order: {order_id}"
    const lsMatch = notes.match(/Order:\s*(\d+)/);
    if (lsMatch) {
        return { provider: 'lemonsqueezy', paymentId: lsMatch[1] };
    }

    // Stripe: use dedicated column first, then fallback to notes regex
    if (booking?.stripe_session_id && booking.stripe_session_id.startsWith('cs_')) {
        return { provider: 'stripe', paymentId: booking.stripe_session_id };
    }
    const stripeMatch = notes.match(/Session:\s*(cs_[a-zA-Z0-9_]+)/);
    if (stripeMatch) {
        return { provider: 'stripe', paymentId: stripeMatch[1] };
    }

    // Generic: stripe_session_id could be LS order ID (stored there by webhook)
    if (booking?.stripe_session_id) {
        return { provider: 'lemonsqueezy', paymentId: booking.stripe_session_id };
    }

    return null;
}

export async function processRefund(bookingId, businessId) {
    if (!supabaseAdmin) {
        return { success: false, error: { code: 'DB_NOT_CONFIGURED', message: 'Database not configured' } };
    }

    if (!businessId) {
        return { success: false, error: { code: 'UNAUTHORIZED', message: 'Business ID required' } };
    }

    const { data: booking, error: fetchError } = await supabaseAdmin
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .eq('business_id', businessId)
        .maybeSingle();

    if (fetchError || !booking) {
        return { success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found' } };
    }

    if (booking.status === 'refunded') {
        return { success: false, error: { code: 'ALREADY_REFUNDED', message: 'This booking has already been refunded' } };
    }

    if (booking.status !== 'confirmed') {
        return { success: false, error: { code: 'INVALID_STATUS', message: 'Only confirmed bookings can be refunded' } };
    }

    const paymentInfo = extractPaymentInfo(booking);
    if (!paymentInfo) {
        return { success: false, error: { code: 'NO_PAYMENT_FOUND', message: 'No payment found for this booking' } };
    }

    try {
        let refundResult;

        if (paymentInfo.provider === 'lemonsqueezy') {
            if (!lsConfigured()) {
                return { success: false, error: { code: 'PAYMENT_NOT_CONFIGURED', message: 'LemonSqueezy not configured' } };
            }

            refundResult = await lsCreateRefund(paymentInfo.paymentId, 'requested_by_customer');
            if (!refundResult) {
                return { success: false, error: { code: 'REFUND_FAILED', message: 'LemonSqueezy refund returned no result' } };
            }

            const refundId = refundResult.id;
            const amount = (refundResult.attributes?.total || booking.service_price * 100) / 100;

            const { error: updateError } = await supabaseAdmin
                .from('bookings')
                .update({
                    status: 'refunded',
                    notes: `${booking.notes || ''} | Refunded via LemonSqueezy: ${refundId} on ${new Date().toISOString().split('T')[0]}`,
                })
                .eq('id', bookingId);

            if (updateError) {
                log.error('refund', 'Failed to update booking status after LS refund:', { error: updateError.message });
                Sentry.captureException(updateError, { tags: { module: 'refund', bookingId } });
            }

            return {
                success: true,
                data: { refundId, amount, status: 'refunded', provider: 'lemonsqueezy' },
            };
        }

        if (paymentInfo.provider === 'stripe') {
            if (!stripe) {
                return { success: false, error: { code: 'PAYMENT_NOT_CONFIGURED', message: 'Stripe not configured' } };
            }

            const session = await stripe.checkout.sessions.retrieve(paymentInfo.paymentId);
            const paymentIntentId = session.payment_intent;

            if (!paymentIntentId) {
                return { success: false, error: { code: 'NO_PAYMENT_INTENT', message: 'No payment found for this session' } };
            }

            refundResult = await stripe.refunds.create({
                payment_intent: paymentIntentId,
                reason: 'requested_by_customer',
            });

            if (refundResult.status === 'failed' || refundResult.status === 'canceled') {
                return { success: false, error: { code: 'REFUND_FAILED', message: `Refund failed: ${refundResult.failure_reason || 'unknown'}` } };
            }

            const { error: updateError } = await supabaseAdmin
                .from('bookings')
                .update({
                    status: 'refunded',
                    notes: `${booking.notes || ''} | Refunded via Stripe: ${refundResult.id} on ${new Date().toISOString().split('T')[0]}`,
                })
                .eq('id', bookingId);

            if (updateError) {
                log.error('refund', 'Failed to update booking status after Stripe refund:', { error: updateError.message });
                Sentry.captureException(updateError, { tags: { module: 'refund', bookingId } });
            }

            return {
                success: true,
                data: {
                    refundId: refundResult.id,
                    amount: refundResult.amount / 100,
                    status: refundResult.status,
                    provider: 'stripe',
                },
            };
        }

        return { success: false, error: { code: 'UNKNOWN_PROVIDER', message: 'Unknown payment provider' } };
    } catch (error) {
        log.error('refund', `${paymentInfo.provider} refund failed:`, { error: error.message });
        Sentry.captureException(error, { tags: { module: 'refund', bookingId, provider: paymentInfo.provider } });
        return { success: false, error: { code: 'REFUND_FAILED', message: error.message } };
    }
}

export async function processRefundWithCancel(bookingId, businessId) {
    const result = await processRefund(bookingId, businessId);
    if (!result.success) return result;

    if (supabaseAdmin && result.success) {
        try {
            const { data: booking } = await supabaseAdmin
                .from('bookings')
                .select('*')
                .eq('id', bookingId)
                .maybeSingle();

            if (booking?.google_event_id) {
                const { cancelCalendarEvent } = await import('./calendar');
                await cancelCalendarEvent(booking.google_event_id);
            }
        } catch (err) {
            log.warn('refund', 'Calendar cancellation failed (best-effort):', { error: err?.message || err });
        }
    }

    return result;
}
