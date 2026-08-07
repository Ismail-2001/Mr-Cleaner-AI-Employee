import * as Sentry from '@sentry/nextjs';

const API_URL = 'https://api.lemonsqueezy.com/v1';

function getApiKey() {
    return process.env.LEMONSQUEEZY_API_KEY || null;
}

export function isConfigured() {
    return !!(getApiKey() && process.env.LEMONSQUEEZY_STORE_ID && process.env.LEMONSQUEEZY_VARIANT_ID);
}

async function apiRequest(endpoint, options = {}) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('LEMONSQUEEZY_NOT_CONFIGURED');

    const url = `${API_URL}${endpoint}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            Accept: 'application/vnd.api+json',
            'Content-Type': 'application/vnd.api+json',
            Authorization: `Bearer ${apiKey}`,
            ...options.headers,
        },
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        // SECURITY: Never expose raw API error body to customers.
        // Log it for debugging, return a generic message to the caller.
        Sentry.captureMessage(`LemonSqueezy API ${response.status}`, {
            level: 'error',
            tags: { module: 'lemon-squeezy', statusCode: response.status },
            extra: { endpoint, errorBody: errorBody.slice(0, 500) },
        });
        throw new Error(`LemonSqueezy API error: ${response.status}`);
    }

    return response.json();
}

export async function createCheckout({ amount, service, customerName, phone, bookingDate, bookingTime, sessionId }) {
    const storeId = process.env.LEMONSQUEEZY_STORE_ID;
    const variantId = process.env.LEMONSQUEEZY_VARIANT_ID;

    if (!storeId || !variantId) {
        throw new Error('LEMONSQUEEZY_NOT_CONFIGURED');
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const payload = {
        data: {
            type: 'checkouts',
            attributes: {
                checkout_data: {
                    custom_price: Math.round(amount * 100),
                    custom: {
                        session_id: sessionId,
                        service,
                        customer_name: customerName || '',
                        phone: phone || '',
                        booking_date: bookingDate || '',
                        booking_time: bookingTime || '',
                        deposit_amount: String(amount),
                    },
                    product_options: {
                        name: `Deposit: ${service}`,
                        description: `Non-refundable booking deposit for ${service} on ${bookingDate} at ${bookingTime}`,
                    },
                    success_url: `${appUrl}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${appUrl}/booking/cancel`,
                },
            },
            relationships: {
                store: { data: { type: 'stores', id: storeId } },
                variant: { data: { type: 'variants', id: variantId } },
            },
        },
    };

    try {
        const result = await apiRequest('/checkouts', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        const checkoutUrl = result?.data?.attributes?.url;
        const checkoutId = result?.data?.id;

        if (!checkoutUrl) {
            throw new Error('LemonSqueezy returned no checkout URL');
        }

        return {
            url: checkoutUrl,
            id: checkoutId,
        };
    } catch (error) {
        Sentry.captureException(error, { tags: { module: 'lemon-squeezy', action: 'createCheckout' } });
        throw error;
    }
}

export async function getOrder(orderId) {
    const result = await apiRequest(`/orders/${orderId}`);
    return result?.data || null;
}

export async function listOrdersBySession(sessionId) {
    const storeId = process.env.LEMONSQUEEZY_STORE_ID;
    if (!storeId) return [];

    const result = await apiRequest(
        `/orders?filter[store_id]=${storeId}&filter[order_status]=paid`
    );

    const orders = result?.data || [];
    return orders.filter(o => o.attributes?.first_order_item?.product_options?.custom?.session_id === sessionId);
}

export async function createRefund(orderId, reason = 'requested_by_customer') {
    try {
        const payload = {
            data: {
                type: 'refunds',
                attributes: { reason },
                relationships: {
                    order: { data: { type: 'orders', id: orderId } },
                },
            },
        };

        const result = await apiRequest('/refunds', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        return result?.data || null;
    } catch (error) {
        Sentry.captureException(error, { tags: { module: 'lemon-squeezy', action: 'createRefund', orderId } });
        throw error;
    }
}

export async function verifyWebhookSignature(payload, signature) {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret || !signature) return false;

    try {
        const { createHmac, timingSafeEqual } = await import('crypto');
        const expected = createHmac('sha256', secret).update(payload).digest('hex');
        const sigBuffer = Buffer.from(signature);
        const expBuffer = Buffer.from(expected);

        if (sigBuffer.length !== expBuffer.length) return false;
        return timingSafeEqual(sigBuffer, expBuffer);
    } catch {
        return false;
    }
}
