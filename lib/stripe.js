import Stripe from 'stripe';

/**
 * Server-side Stripe client. The secret key is NEVER exposed to the client bundle.
 * If STRIPE_SECRET_KEY is not set, the module exports null — callers must check
 * and fall back gracefully (e.g., for local dev without Stripe configured).
 */
export const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

/**
 * Creates a real Stripe Checkout Session for the booking deposit.
 *
 * WHY THIS FIX MATTERS:
 * The old code returned a fake URL (`checkout.stripe.com/pay/cs_test_...`) —
 * no real Stripe session was created, so no payment was ever collected or
 * verifiable. This creates an actual Checkout Session that Stripe hosts, and
 * the webhook handler (app/api/stripe/webhook) is the source of truth for
 * whether payment succeeded — not the client-side redirect.
 */
export async function createDepositSession({ amount, service, customerName, phone, bookingDate, bookingTime, sessionId }) {
    if (!stripe) {
        throw new Error('Stripe not configured — set STRIPE_SECRET_KEY in .env.local');
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_creation: 'always',
        line_items: [
            {
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `Deposit: ${service}`,
                        description: `Non-refundable booking deposit for ${service} on ${bookingDate} at ${bookingTime}`,
                    },
                    // Stripe expects amount in cents
                    unit_amount: Math.round(amount * 100),
                },
                quantity: 1,
            },
        ],
        success_url: `${appUrl}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/booking/cancel`,
        metadata: {
            session_id: sessionId,
            service,
            customer_name: customerName || '',
            phone: phone || '',
            booking_date: bookingDate || '',
            booking_time: bookingTime || '',
            deposit_amount: amount,
        },
    });

    return session;
}
