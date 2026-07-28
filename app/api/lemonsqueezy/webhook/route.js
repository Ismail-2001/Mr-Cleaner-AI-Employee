import * as Sentry from '@sentry/nextjs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { triggerLeadAlerts } from '@/lib/twilio';
import { sendBookingConfirmation } from '@/lib/email';
import { verifyWebhookSignature } from '@/lib/lemon-squeezy';

export async function POST(req) {
    const requestId = crypto.randomUUID();

    const rawBody = await req.text();
    const sig = req.headers.get('x-signature');

    const valid = await verifyWebhookSignature(rawBody, sig);
    if (!valid) {
        console.error(`[${requestId}] LemonSqueezy webhook signature verification failed`);
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

        console.log(`[${requestId}] Payment confirmed:`, {
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
                console.log(`[${requestId}] Duplicate order webhook, skipping.`);
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
                console.warn(JSON.stringify({
                    code: 'MISSING_REAL_PRICE',
                    session_id: custom.session_id,
                    detail: 'Booking created without a real price from chat session. Analytics will show null.',
                    timestamp: new Date().toISOString(),
                }));
            }

            const { error: updateError } = await supabaseAdmin
                .from('chat_sessions')
                .update({
                    customer_data: mergedCustomerData,
                    last_active: new Date().toISOString(),
                })
                .eq('session_id', custom.session_id);

            if (updateError) {
                console.error(`[${requestId}] Failed to update session:`, updateError.message);
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
                        console.log(`[${requestId}] Booking already exists, skipping.`);
                        return Response.json({ received: true, duplicate: true });
                    }
                    console.error(`[${requestId}] Failed to create booking:`, bookingError.message);
                    Sentry.captureException(bookingError, { tags: { module: 'ls-webhook', requestId } });
                }

                const customerEmail = attributes.customer_email || mergedCustomerData.email;

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

                if (customerEmail) {
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
                }
            }
        }
    }

    if (eventName === 'order_refunded') {
        const orderId = event.data.id;
        console.log(`[${requestId}] Order refunded: ${orderId}`);

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
                    console.error(`[${requestId}] Failed to update booking refund status:`, updateError.message);
                    Sentry.captureException(updateError, { tags: { module: 'ls-webhook-refund', requestId, orderId } });
                }
            }
        }
    }

    return Response.json({ received: true });
}
