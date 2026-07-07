import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { triggerLeadAlerts } from '@/lib/twilio';

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

    if (!stripe) {
        console.error(`[${requestId}] Stripe webhook received but STRIPE_SECRET_KEY not configured`);
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
        console.error(`[${requestId}] Webhook signature verification failed:`, err.message);
        return Response.json(
            { error: { code: 'INVALID_SIGNATURE', message: `Webhook Error: ${err.message}`, request_id: requestId } },
            { status: 400 }
        );
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const metadata = session.metadata || {};

        console.log(`[${requestId}] Payment confirmed:`, {
            stripe_session_id: session.id,
            session_id: metadata.session_id,
            service: metadata.service,
            amount: metadata.deposit_amount,
        });

        if (supabaseAdmin && metadata.session_id) {
            // BUG FIX (idempotency): Check if a booking with this Stripe session
            // already exists. Stripe retries webhooks — without this guard, each
            // retry creates a duplicate booking.
            const { data: existingBooking } = await supabaseAdmin
                .from('bookings')
                .select('id')
                .eq('notes', `Deposit paid via Stripe. Session: ${session.id}`)
                .limit(1)
                .maybeSingle();

            if (existingBooking) {
                console.log(`[${requestId}] Webhook already processed, skipping.`);
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

            const { error: updateError } = await supabaseAdmin
                .from('chat_sessions')
                .update({
                    customer_data: mergedCustomerData,
                    last_active: new Date().toISOString(),
                })
                .eq('session_id', metadata.session_id);

            if (updateError) {
                console.error(`[${requestId}] Failed to update session after payment:`, updateError.message);
            }

            // Insert a booking record if we have enough data
            if (metadata.customer_name && metadata.service && metadata.booking_date) {
                const scheduledAt = new Date(
                    `${metadata.booking_date} ${metadata.booking_time || '09:00'}`
                ).toISOString();

                const { error: bookingError } = await supabaseAdmin
                    .from('bookings')
                    .insert([{
                        customer_name: metadata.customer_name,
                        phone: metadata.phone || '',
                        vehicle_type: mergedCustomerData.vehicle_type || 'pending',
                        service: metadata.service,
                        service_price: metadata.deposit_amount * 4,
                        scheduled_at: scheduledAt,
                        address: mergedCustomerData.address || '',
                        zip_code: mergedCustomerData.zip_code || '',
                        status: 'confirmed',
                        notes: `Deposit paid via Stripe. Session: ${session.id}`,
                    }]);

                if (bookingError) {
                    if (bookingError.code === '23505') {
                        console.log(`[${requestId}] Booking already exists, skipping.`);
                        return Response.json({ received: true, duplicate: true });
                    }
                    console.error(`[${requestId}] Failed to create booking:`, bookingError.message);
                }

                await triggerLeadAlerts({
                    customer_name: metadata.customer_name,
                    phone: metadata.phone,
                    service: metadata.service,
                    service_price: metadata.deposit_amount * 4,
                    booking_date: metadata.booking_date,
                    booking_time: metadata.booking_time,
                    lead_score: 80,
                });
            }
        }
    }

    return Response.json({ received: true });
}
