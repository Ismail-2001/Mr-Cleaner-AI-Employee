import * as Sentry from '@sentry/nextjs';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { triggerLeadAlerts } from '@/lib/twilio';
import { sendBookingConfirmation } from '@/lib/email';
import { checkWebhookRateLimit } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

/**
 * POST /api/stripe/webhook — Stripe webhook handler for payment confirmation.
 *
 * The old code assumed a client-side redirect meant payment succeeded. But
 * client redirects can be faked — a user could navigate directly to the
 * success URL without actually paying. The webhook is the only trustworthy
 * signal that money moved. Stripe calls this endpoint server-to-server with
 * a signed payload, so we verify the signature before trusting anything.
 */
export async function POST(req) {
    const requestId = crypto.randomUUID();

    // RATE LIMIT: Prevent webhook flood abuse (even with valid signature)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimited = await checkWebhookRateLimit(ip);
    if (rateLimited) {
        log.warn('stripe-webhook', 'Rate limited', { requestId, ip });
        return Response.json({ error: 'Rate limited' }, { status: 429 });
    }

    if (!stripe) {
        log.error('stripe-webhook', 'Stripe webhook received but STRIPE_SECRET_KEY not configured', { requestId });
        return Response.json(
            { error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Stripe not configured', request_id: requestId } },
            { status: 500 }
        );
    }

    let event;

    try {
        const rawBody = Buffer.from(await req.arrayBuffer());
        const sig = req.headers.get('stripe-signature');

        if (!sig) {
            return Response.json(
                { error: { code: 'MISSING_SIGNATURE', message: 'Missing stripe-signature header', request_id: requestId } },
                { status: 400 }
            );
        }

        event = stripe.webhooks.constructEvent(
            rawBody,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        log.error('stripe-webhook', 'Webhook signature verification failed', { requestId, error: err.message });
        Sentry.captureException(err, { tags: { route: 'webhook', code: 'INVALID_SIGNATURE', requestId } });
        return Response.json(
            { error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed', request_id: requestId } },
            { status: 400 }
        );
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const metadata = session.metadata || {};

        log.info('stripe-webhook', 'Payment confirmed', {
            requestId,
            stripe_session_id: session.id,
            session_id: metadata.session_id,
            service: metadata.service,
            amount: metadata.deposit_amount,
        });

        if (supabaseAdmin && metadata.session_id) {
            // BUG FIX (idempotency): Check if a booking with this Stripe session
            // already exists. Stripe retries webhooks — without this guard, each
            // retry creates a duplicate booking.
            //
            // PREVIOUS: Matched on notes string (fragile, depends on exact formatting).
            // NOW: Matches on stripe_session_id column (dedicated, indexed, UNIQUE).
            // NULL = NULL is FALSE in SQL, so old bookings without this column are safe.
            const { data: existingBooking } = await supabaseAdmin
                .from('bookings')
                .select('id')
                .eq('stripe_session_id', session.id)
                .limit(1)
                .maybeSingle();

            if (existingBooking) {
                log.info('stripe-webhook', 'Webhook already processed, skipping', { requestId });
                return Response.json({ received: true, duplicate: true });
            }

            // BUG FIX (data wipe): Use Supabase JSONB merge to preserve existing
            // customer_data fields.
            const { data: existingSession } = await supabaseAdmin
                .from('chat_sessions')
                .select('customer_data')
                .eq('session_id', metadata.session_id)
                .maybeSingle();

            const mergedCustomerData = {
                ...(existingSession?.customer_data || {}),
                deposit_paid: true,
                stripe_session_id: session.id,
                deposit_amount: metadata.deposit_amount,
            };

            // REVENUE INTEGRITY: Use the real price from the chat session, not a
            // fabricated formula. The price was computed by calculate_quote and
            // synced via sync_booking_state throughout the conversation.
            // Previously this was metadata.deposit_amount * 4, which produced a
            // flat $200 for every booking regardless of service tier — making the
            // dashboard revenue KPI completely fictional.
            const realPrice = mergedCustomerData.price;
            const servicePrice = (typeof realPrice === 'number' && realPrice > 0)
                ? realPrice
                : null;

            if (servicePrice === null) {
                log.warn('stripe-webhook', 'Booking created without a real price from chat session. Analytics will show null for this booking.', {
                    requestId,
                    code: 'MISSING_REAL_PRICE',
                    session_id: metadata.session_id,
                });
            }

            const { error: updateError } = await supabaseAdmin
                .from('chat_sessions')
                .update({
                    customer_data: mergedCustomerData,
                    last_active: new Date().toISOString(),
                })
                .eq('session_id', metadata.session_id);

            if (updateError) {
                log.error('stripe-webhook', 'Failed to update session after payment', { requestId, error: updateError.message });
            }

            // Insert a booking record if we have enough data
            if (metadata.customer_name && metadata.service && metadata.booking_date) {
                const { error: bookingError } = await supabaseAdmin
                    .from('bookings')
                    .insert([{
                        customer_name: metadata.customer_name,
                        phone: metadata.phone || '',
                        vehicle_type: mergedCustomerData.vehicle_type || 'pending',
                        service: metadata.service,
                        service_price: servicePrice,
                        booking_date: metadata.booking_date,
                        booking_time: metadata.booking_time || '09:00',
                        address: mergedCustomerData.address || '',
                        zip_code: mergedCustomerData.zip_code || '',
                        status: 'confirmed',
                        stripe_session_id: session.id,
                        notes: `Deposit paid via Stripe. Session: ${session.id}${servicePrice === null ? ' (price missing from chat session)' : ''}`,
                    }]);

                if (bookingError) {
                    if (bookingError.code === '23505') {
                        log.info('stripe-webhook', 'Booking already exists, skipping', { requestId });
                        return Response.json({ received: true, duplicate: true });
                    }
                    log.error('stripe-webhook', 'Failed to create booking', { requestId, error: bookingError.message });
                }

                try {
                    await triggerLeadAlerts({
                        customer_name: metadata.customer_name,
                        phone: metadata.phone,
                        service: metadata.service,
                        service_price: servicePrice,
                        booking_date: metadata.booking_date,
                        booking_time: metadata.booking_time,
                        lead_score: 80,
                        language: mergedCustomerData.language || 'en',
                    });
                } catch (alertErr) {
                    log.error('stripe-webhook', 'triggerLeadAlerts failed (non-blocking)', { requestId, error: alertErr.message });
                    Sentry.captureException(alertErr, { tags: { module: 'stripe-webhook', requestId, code: 'LEAD_ALERT_FAILED' } });
                }

                const customerEmail = session.customer_details?.email || mergedCustomerData.email;
                if (customerEmail) {
                    try {
                        await sendBookingConfirmation({
                            email: customerEmail,
                            customerName: metadata.customer_name,
                            service: metadata.service,
                            servicePrice,
                            bookingDate: metadata.booking_date,
                            bookingTime: metadata.booking_time || '09:00',
                            address: mergedCustomerData.address,
                            language: mergedCustomerData.language || 'en',
                        });
                    } catch (emailErr) {
                        log.error('stripe-webhook', 'sendBookingConfirmation failed (non-blocking)', { requestId, error: emailErr.message });
                        Sentry.captureException(emailErr, { tags: { module: 'stripe-webhook', requestId, code: 'CONFIRMATION_EMAIL_FAILED' } });
                    }
                }
            }
        }
    }

    return Response.json({ received: true });
}
