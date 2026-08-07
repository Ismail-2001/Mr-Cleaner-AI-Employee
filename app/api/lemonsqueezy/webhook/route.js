import * as Sentry from '@sentry/nextjs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { triggerLeadAlerts } from '@/lib/twilio';
import { sendBookingConfirmation } from '@/lib/email';
import { verifyWebhookSignature } from '@/lib/lemon-squeezy';
import { checkWebhookRateLimit } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

export async function POST(req) {
    const requestId = crypto.randomUUID();

    // RATE LIMIT: Prevent webhook flood abuse (even with valid signature)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimited = await checkWebhookRateLimit(ip);
    if (rateLimited) {
        log.warn('lemonsqueezy-webhook', 'Rate limited', { requestId, ip });
        return Response.json({ error: 'Rate limited' }, { status: 429 });
    }

    const rawBody = await req.text();
    const sig = req.headers.get('x-signature');

    const valid = await verifyWebhookSignature(rawBody, sig);
    if (!valid) {
        log.error('lemonsqueezy-webhook', 'Webhook signature verification failed', { requestId });
        return Response.json(
            { error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed', request_id: requestId } },
            { status: 400 }
        );
    }

    let event;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return Response.json(
            { error: { code: 'INVALID_PAYLOAD', message: 'Invalid JSON body', request_id: requestId } },
            { status: 400 }
        );
    }

    const eventName = event?.meta?.event_name;

    if (eventName === 'order_created') {
        const order = event.data;
        const attributes = order.attributes || {};
        const custom = attributes.first_order_item?.product_options?.custom || event.meta?.custom_data || {};
        const orderId = order.id;

        log.info('lemonsqueezy-webhook', 'Payment confirmed', {
            requestId,
            ls_order_id: orderId,
            session_id: custom.session_id,
            service: custom.service,
            amount: custom.deposit_amount,
        });

        if (supabaseAdmin && custom.session_id) {
            const { data: existingBooking } = await supabaseAdmin
                .from('bookings')
                .select('id')
                .eq('stripe_session_id', orderId)
                .limit(1)
                .maybeSingle();

            if (existingBooking) {
                log.info('lemonsqueezy-webhook', 'Duplicate order webhook, skipping', { requestId });
                return Response.json({ received: true, duplicate: true });
            }

            const { data: existingSession } = await supabaseAdmin
                .from('chat_sessions')
                .select('customer_data')
                .eq('session_id', custom.session_id)
                .maybeSingle();

            const mergedCustomerData = {
                ...(existingSession?.customer_data || {}),
                deposit_paid: true,
                ls_order_id: orderId,
                deposit_amount: parseFloat(custom.deposit_amount || 0),
                payment_provider: 'lemonsqueezy',
            };

            const realPrice = mergedCustomerData.price;
            const servicePrice = (typeof realPrice === 'number' && realPrice > 0) ? realPrice : null;

            if (servicePrice === null) {
                log.warn('lemonsqueezy-webhook', 'Booking created without a real price from chat session. Analytics will show null.', {
                    requestId,
                    code: 'MISSING_REAL_PRICE',
                    session_id: custom.session_id,
                });
            }

            const { error: updateError } = await supabaseAdmin
                .from('chat_sessions')
                .update({
                    customer_data: mergedCustomerData,
                    last_active: new Date().toISOString(),
                })
                .eq('session_id', custom.session_id);

            if (updateError) {
                log.error('lemonsqueezy-webhook', 'Failed to update session', { requestId, error: updateError.message });
                Sentry.captureException(updateError, { tags: { module: 'ls-webhook', requestId } });
            }

            if (custom.customer_name && custom.service && custom.booking_date) {
                const { error: bookingError } = await supabaseAdmin
                    .from('bookings')
                    .insert([{
                        customer_name: custom.customer_name,
                        phone: custom.phone || '',
                        vehicle_type: mergedCustomerData.vehicle_type || 'pending',
                        service: custom.service,
                        service_price: servicePrice,
                        booking_date: custom.booking_date,
                        booking_time: custom.booking_time || '09:00',
                        address: mergedCustomerData.address || '',
                        zip_code: mergedCustomerData.zip_code || '',
                        status: 'confirmed',
                        stripe_session_id: orderId,
                        notes: `Deposit paid via LemonSqueezy. Order: ${orderId}${servicePrice === null ? ' (price missing from chat session)' : ''}`,
                    }]);

                if (bookingError) {
                    if (bookingError.code === '23505') {
                        log.info('lemonsqueezy-webhook', 'Booking already exists, skipping', { requestId });
                        return Response.json({ received: true, duplicate: true });
                    }
                    log.error('lemonsqueezy-webhook', 'Failed to create booking', { requestId, error: bookingError.message });
                    Sentry.captureException(bookingError, { tags: { module: 'ls-webhook', requestId } });
                }

                const customerEmail = attributes.customer_email || mergedCustomerData.email;

                try {
                    await triggerLeadAlerts({
                        customer_name: custom.customer_name,
                        phone: custom.phone,
                        service: custom.service,
                        service_price: servicePrice,
                        booking_date: custom.booking_date,
                        booking_time: custom.booking_time,
                        lead_score: 80,
                        language: mergedCustomerData.language || 'en',
                    });
                } catch (alertErr) {
                    log.error('lemonsqueezy-webhook', 'triggerLeadAlerts failed (non-blocking)', { requestId, error: alertErr.message });
                    Sentry.captureException(alertErr, { tags: { module: 'ls-webhook', requestId, code: 'LEAD_ALERT_FAILED' } });
                }

                if (customerEmail) {
                    try {
                        await sendBookingConfirmation({
                            email: customerEmail,
                            customerName: custom.customer_name,
                            service: custom.service,
                            servicePrice,
                            bookingDate: custom.booking_date,
                            bookingTime: custom.booking_time || '09:00',
                            address: mergedCustomerData.address,
                            language: mergedCustomerData.language || 'en',
                        });
                    } catch (emailErr) {
                        log.error('lemonsqueezy-webhook', 'sendBookingConfirmation failed (non-blocking)', { requestId, error: emailErr.message });
                        Sentry.captureException(emailErr, { tags: { module: 'ls-webhook', requestId, code: 'CONFIRMATION_EMAIL_FAILED' } });
                    }
                }
            }
        }
    }

    if (eventName === 'order_refunded') {
        const orderId = event.data.id;
        log.info('lemonsqueezy-webhook', `Order refunded: ${orderId}`, { requestId });

        if (supabaseAdmin) {
            const { data: booking } = await supabaseAdmin
                .from('bookings')
                .select('id, status')
                .eq('stripe_session_id', orderId)
                .maybeSingle();

            if (booking && booking.status !== 'refunded') {
                const { error: updateError } = await supabaseAdmin
                    .from('bookings')
                    .update({
                        status: 'refunded',
                        notes: `${booking.notes || ''} | Refunded via LemonSqueezy on ${new Date().toISOString().split('T')[0]}`,
                    })
                    .eq('id', booking.id);

                if (updateError) {
                    log.error('lemonsqueezy-webhook', 'Failed to update booking refund status', { requestId, error: updateError.message });
                    Sentry.captureException(updateError, { tags: { module: 'ls-webhook-refund', requestId, orderId } });
                }
            }
        }
    }

    return Response.json({ received: true });
}
