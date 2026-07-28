/**
 * Meta (Facebook Messenger + Instagram) integration utilities.
 *
 * SECURITY:
 * - Webhook signature verification via HMAC-SHA256 (X-Hub-Signature-256)
 * - Prevents spoofed webhook calls from non-Meta servers
 * - Rate limiting on the webhook endpoint
 *
 * WEBHOOK FLOW:
 * 1. GET /api/webhook/meta — Meta sends a verification request (hub.verify_token + hub.challenge)
 * 2. POST /api/webhook/meta — Meta sends messages as JSON with entry[].messaging[] or entry[].changes[]
 * 3. We process the message through orchestrateMaya() and reply via Graph API
 *
 * REFERENCES:
 * - Messenger: https://developers.facebook.com/docs/messenger-platform/webhooks
 * - Instagram: https://developers.facebook.com/docs/instagram-api/webhooks
 */

import * as Sentry from '@sentry/nextjs';

const META_VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

// ─── Signature Verification ──────────────────────────────────────────────────

/**
 * Verify the X-Hub-Signature-256 header from Meta.
 * Uses HMAC-SHA256 with the app secret to authenticate the request.
 *
 * @param {string} rawBody - The raw request body as a string
 * @param {string} signature - The X-Hub-Signature-256 header value
 * @returns {boolean} true if signature is valid
 */
export function verifyMetaSignature(rawBody, signature) {
    if (!META_APP_SECRET) {
        // SECURITY: Fail closed — never accept unverified webhooks in production.
        // In development, allow through with a clear warning so local testing works
        // without configuring Meta app secrets.
        if (process.env.NODE_ENV === 'production') {
            console.error('CRITICAL: META_APP_SECRET not set — rejecting webhook (fail closed)');
            return false;
        }
        console.warn('META_APP_SECRET not set — allowing webhook in development (INSECURE)');
        return true;
    }

    if (!signature) {
        console.warn('No X-Hub-Signature-256 header provided');
        return false;
    }

    const crypto = require('crypto');
    const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', META_APP_SECRET)
        .update(rawBody, 'utf8')
        .digest('hex');

    // Constant-time comparison to prevent timing attacks
    try {
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    } catch {
        return false;
    }
}

// ─── Webhook Verification (GET) ──────────────────────────────────────────────

/**
 * Verify the webhook with Meta's challenge-response mechanism.
 * Called by Meta when you first subscribe the webhook.
 *
 * @param {URL} url - The request URL
 * @returns {Response} The challenge value or 403
 */
export function handleWebhookVerification(url) {
    const searchParams = url.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === META_VERIFY_TOKEN && challenge) {
        console.log('Meta webhook verified successfully');
        return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    console.warn('Meta webhook verification failed', { mode, token: token ? '***' : null });
    return Response.json({ error: { code: 'FORBIDDEN', message: 'Verification failed' } }, { status: 403 });
}

// ─── Message Parsing ─────────────────────────────────────────────────────────

/**
 * Extract messages from a Meta webhook payload.
 * Handles both Messenger and Instagram webhook formats.
 *
 * Messenger format:
 *   { entry: [{ messaging: [{ sender: { id }, message: { text } }] }] }
 *
 * Instagram format:
 *   { entry: [{ changes: [{ value: { from: { id }, text: "..." } }] }] }
 *
 * @param {Object} body - Parsed webhook body
 * @returns {Array} Array of { senderId, text, platform, recipientId }
 */
export function parseWebhookMessages(body) {
    const messages = [];

    if (!body?.entry) return messages;

    for (const entry of body.entry) {
        // Messenger: entry.messaging[]
        if (entry.messaging) {
            for (const event of entry.messaging) {
                if (event.message?.text && event.sender?.id) {
                    messages.push({
                        senderId: event.sender.id,
                        recipientId: event.recipient?.id,
                        text: event.message.text,
                        platform: 'messenger',
                        messageId: event.message.mid,
                    });
                }
            }
        }

        // Instagram: entry.changes[].value
        if (entry.changes) {
            for (const change of entry.changes) {
                const value = change.value;
                if (value?.text && value?.from?.id) {
                    messages.push({
                        senderId: value.from.id,
                        recipientId: value.to?.[0]?.id,
                        text: value.text,
                        platform: 'instagram',
                        messageId: value.message_id,
                    });
                }
            }
        }
    }

    return messages;
}

// ─── Message Sending ─────────────────────────────────────────────────────────

/**
 * Send a message via Meta Graph API.
 * Works for both Messenger and Instagram.
 *
 * @param {string} recipientId - The user's Meta/Instagram ID
 * @param {string} text - Message text to send
 * @param {string} platform - 'messenger' | 'instagram'
 * @returns {Object} { success, messageId?, error? }
 */
export async function sendMetaMessage(recipientId, text, platform = 'messenger') {
    if (!META_ACCESS_TOKEN) {
        console.warn('META_ACCESS_TOKEN not set — simulating message send');
        console.log(`[SIMULATED ${platform.toUpperCase()} to ${recipientId}]: ${text}`);
        return { success: true, simulated: true };
    }

    // Truncate to Meta's limit (2000 chars for Messenger, 1000 for Instagram)
    const maxLength = platform === 'instagram' ? 1000 : 2000;
    const truncatedText = text.length > maxLength ? text.slice(0, maxLength - 3) + '...' : text;

    const endpoint = platform === 'instagram'
        ? 'https://graph.facebook.com/v19.0/me/messages'
        : 'https://graph.facebook.com/v19.0/me/messages';

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: recipientId },
                message: { text: truncatedText },
                access_token: META_ACCESS_TOKEN,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error(`Meta ${platform} send failed:`, data.error?.message);
            Sentry.captureException(new Error(`Meta ${platform} send failed: ${data.error?.message}`), {
                tags: { module: 'meta', method: 'sendMetaMessage', platform },
                extra: { recipientId: recipientId?.slice(-4), statusCode: response.status },
            });
            return { success: false, error: data.error?.message };
        }

        console.log(`Meta ${platform} message sent: ${data.message_id}`);
        return { success: true, messageId: data.message_id };
    } catch (error) {
        console.error(`Meta ${platform} send error:`, error.message);
        Sentry.captureException(error, {
            tags: { module: 'meta', method: 'sendMetaMessage', platform },
        });
        return { success: false, error: error.message };
    }
}

// ─── Business Resolution ─────────────────────────────────────────────────────

/**
 * Resolve business ID from a Meta Page ID or Instagram account ID.
 * Checks the businesses table for a matching page_id or location_id.
 *
 * @param {string} pageId - The Meta Page ID or Instagram account ID
 * @param {string} platform - 'messenger' | 'instagram'
 * @returns {string|null} Business UUID or null
 */
export async function resolveBusinessByMetaId(pageId, platform = 'messenger') {
    const { supabaseAdmin } = await import('@/lib/supabase-admin');
    if (!supabaseAdmin || !pageId) return null;

    try {
        // Check businesses table for matching page_id or instagram_id
        const { data } = await supabaseAdmin
            .from('businesses')
            .select('id')
            .or(`page_id.eq.${pageId},instagram_id.eq.${pageId}`)
            .eq('is_active', true)
            .single();

        return data?.id || null;
    } catch (err) {
        console.error('resolveBusinessByMetaId error:', err?.message || err);
        return null;
    }
}
