import * as Sentry from '@sentry/nextjs';
import { stripe } from './stripe';
import { supabaseAdmin } from './supabase-admin';

/**
 * Extract Stripe session ID from a booking record.
 * The session ID is stored in the notes field by the webhook handler.
 * Returns null if not found.
 */
function extractStripeSessionId(booking) {
    if (!booking?.notes) return null;
    const match = booking.notes.match(/Session:\s*(cs_[a-zA-Z0-9_]+)/);
    return match ? match[1] : null;
}

/**
 * Process a full refund for a booking.
 *
 * Steps:
 * 1. Fetch booking from Supabase
 * 2. Extract Stripe session ID from notes
 * 3. Retrieve Checkout Session to get PaymentIntent
 * 4. Issue refund via Stripe
 * 5. Update booking status to 'refunded'
 *
 * Returns { success, error? }
 */
export async function processRefund(bookingId) {
    if (!supabaseAdmin) {
        return { success: false, error: { code: 'DB_NOT_CONFIGURED', message: 'Database not configured' } };
    }

    if (!stripe) {
        return { success: false, error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Stripe not configured' } };
    }

    // 1. Fetch the booking
    const { data: booking, error: fetchError } = await supabaseAdmin
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .maybeSingle();

    if (fetchError || !booking) {
        return { success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found' } };
    }

    // 2. Prevent double-refund
    if (booking.status === 'refunded') {
        return { success: false, error: { code: 'ALREADY_REFUNDED', message: 'This booking has already been refunded' } };
    }

    // Only confirmed bookings with a paid deposit can be refunded
    if (booking.status !== 'confirmed') {
        return { success: false, error: { code: 'INVALID_STATUS', message: 'Only confirmed bookings can be refunded' } };
    }

    // 3. Extract Stripe session ID
    const stripeSessionId = extractStripeSessionId(booking);
    if (!stripeSessionId) {
        return { success: false, error: { code: 'NO_STRIPE_SESSION', message: 'No Stripe payment found for this booking' } };
    }

    try {
        // 4. Retrieve Checkout Session to get PaymentIntent
        const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
        const paymentIntentId = session.payment_intent;

        if (!paymentIntentId) {
            return { success: false, error: { code: 'NO_PAYMENT_INTENT', message: 'No payment found for this session' } };
        }

        // 5. Issue refund
        const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            reason: 'requested_by_customer',
        });

        if (refund.status === 'failed' || refund.status === 'canceled') {
            return { success: false, error: { code: 'REFUND_FAILED', message: `Refund failed: ${refund.failure_reason || 'unknown'}` } };
        }

        // 6. Update booking status
        const { error: updateError } = await supabaseAdmin
            .from('bookings')
            .update({
                status: 'refunded',
                notes: `${booking.notes || ''} | Refunded: ${refund.id} on ${new Date().toISOString().split('T')[0]}`,
            })
            .eq('id', bookingId);

        if (updateError) {
            console.error('Failed to update booking status after refund:', updateError.message);
            Sentry.captureException(updateError, { tags: { module: 'refund', bookingId } });
        }

        return {
            success: true,
            data: {
                refundId: refund.id,
                amount: refund.amount / 100,
                status: refund.status,
            },
        };
    } catch (error) {
        console.error('Stripe refund failed:', error.message);
        Sentry.captureException(error, { tags: { module: 'refund', bookingId, stripeSessionId } });
        return { success: false, error: { code: 'REFUND_FAILED', message: error.message } };
    }
}

/**
 * Refund and also cancel the associated Google Calendar event.
 * Extends processRefund with optional calendar cleanup.
 */
export async function processRefundWithCancel(bookingId) {
    const result = await processRefund(bookingId);
    if (!result.success) return result;

    // Attempt calendar cancellation (non-fatal if it fails)
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
        } catch {
            // Calendar cancellation is best-effort
        }
    }

    return result;
}
