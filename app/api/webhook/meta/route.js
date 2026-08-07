/**
 * Meta Webhook — Messenger + Instagram DMs
 *
 * GET  /api/webhook/meta — Webhook verification (challenge-response)
 * POST /api/webhook/meta — Incoming messages from Messenger/Instagram
 *
 * SECURITY:
 * - HMAC-SHA256 signature verification (X-Hub-Signature-256)
 * - Rate limiting: 60 requests/min per IP
 * - Idempotency: deduplicate by message ID (Redis-backed, in-memory fallback)
 * - Business resolution: maps Page ID → business UUID
 *
 * RELIABILITY:
 * - Signature verified synchronously (fail-closed)
 * - Message processing delegated to QStash for async delivery with retries
 * - 200 returned immediately to Meta, QStash handles processing
 *
 * ENV: META_WEBHOOK_VERIFY_TOKEN, META_APP_SECRET, META_ACCESS_TOKEN,
 *      QSTASH_TOKEN (optional — falls back to synchronous processing)
 */

import * as Sentry from '@sentry/nextjs';
import { log } from '@/lib/logger';
import { verifyMetaSignature, handleWebhookVerification, parseWebhookMessages, sendMetaMessage, sendWhatsAppMessage } from '@/lib/meta';
import { orchestrateMaya } from '@/lib/maestro';
import { resolveBusinessByMetaId } from '@/lib/meta';
import { checkWebhookRateLimit } from '@/lib/rate-limit';
import { getRedisClient, tryRedisOp } from '@/lib/redis';

// ─── Idempotency: Redis-backed dedup ─────────────────────────────────────────

const DEDUP_TTL_SEC = 5 * 60; // 5 minutes in seconds
const DEDUP_KEY_PREFIX = 'meta:dedup:';

async function isDuplicate(messageId) {
    if (!messageId) return false;

    const redisKey = `${DEDUP_KEY_PREFIX}${messageId}`;
    const result = await tryRedisOp(async (redis) => {
        const SET_KEY = `${redisKey}_set`;
        const added = await redis.set(SET_KEY, '1', { nx: true, ex: DEDUP_TTL_SEC });
        return added !== null; // null = key already exists = duplicate
    });

    if (result !== null) return result; // Redis answered
    // In-memory fallback
    return isDuplicateMemory(messageId);
}

// In-memory fallback (same logic as before, no longer used in production)
const processedMessagesMemory = new Map();
function isDuplicateMemory(messageId) {
    if (processedMessagesMemory.has(messageId)) return true;
    processedMessagesMemory.set(messageId, Date.now());
    if (processedMessagesMemory.size > 10000) {
        const cutoff = Date.now() - 5 * 60 * 1000;
        for (const [id, ts] of processedMessagesMemory) {
            if (ts < cutoff) processedMessagesMemory.delete(id);
        }
    }
    return false;
}

// ─── QStash: Async processing with retries ───────────────────────────────────

async function publishToQStash(payload) {
    const qstashToken = process.env.QSTASH_TOKEN;
    if (!qstashToken) return false;

    try {
        const { Client } = await import('@upstash/qstash');
        const client = new Client({ token: qstashToken });
        await client.publishJSON({
            url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://mr-cleaner.vercel.app'}/api/webhook/meta/process`,
            body: payload,
            retries: 3,
        });
        return true;
    } catch (err) {
        log.warn('meta-webhook', 'QStash publish failed, falling back to sync', { error: err.message });
        return false;
    }
}

// ─── GET: Webhook Verification ───────────────────────────────────────────────

export async function GET(req) {
    return handleWebhookVerification(new URL(req.url));
}

// ─── POST: Message Handler ───────────────────────────────────────────────────

export async function POST(req) {
    const requestId = crypto.randomUUID();

    // RATE LIMITING: 60 requests/min per IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || '127.0.0.1';

    const rateLimit = await checkWebhookRateLimit(ip);
    if (rateLimit) {
        log.info('webhook-meta', 'Meta webhook rate limited', { requestId, ip });
        return Response.json({ status: 'rate_limited' }, {
            status: 429,
            headers: { 'Retry-After': String(rateLimit.retryAfterSec) },
        });
    }

    try {
        // Read raw body for signature verification
        const rawBody = await req.text();
        const signature = req.headers.get('x-hub-signature-256');

        // SIGNATURE VERIFICATION: Ensure request is from Meta
        if (!verifyMetaSignature(rawBody, signature)) {
            log.warn('webhook-meta', 'Invalid Meta webhook signature', { requestId, ip });
            Sentry.captureMessage('Invalid Meta webhook signature', {
                level: 'warning',
                tags: { module: 'meta-webhook', requestId },
                extra: { ip },
            });
            return Response.json({ error: { code: 'FORBIDDEN', message: 'Invalid signature' } }, { status: 403 });
        }

        // Parse the body
        let body;
        try {
            body = JSON.parse(rawBody);
        } catch (e) {
            log.error('webhook-meta', 'Failed to parse webhook body', { requestId, error: e.message });
            return Response.json({ status: 'error', message: 'Invalid JSON' }, { status: 400 });
        }

        // Verify it's a supported Meta event (Messenger, Instagram, WhatsApp)
        const supportedObjects = ['page', 'instagram', 'whatsapp_business_account'];
        if (!supportedObjects.includes(body.object)) {
            log.info('webhook-meta', 'Ignoring non-page event', { requestId, eventObject: body.object });
            return Response.json({ status: 'ok' });
        }

        // Extract messages from webhook payload
        const messages = parseWebhookMessages(body);

        if (messages.length === 0) {
            // No text messages — could be a delivery receipt, read receipt, etc.
            return Response.json({ status: 'ok' });
        }

        log.info('webhook-meta', `Received ${messages.length} message(s) from ${messages[0].platform}`, { requestId });

        // Filter: dedup + skip bot self-messages
        const validMessages = [];
        for (const msg of messages) {
            if (await isDuplicate(msg.messageId)) {
                log.info('webhook-meta', 'Skipping duplicate message', { requestId, messageId: msg.messageId });
                continue;
            }
            if (msg.senderId === msg.recipientId) {
                log.info('webhook-meta', 'Skipping bot self-message', { requestId });
                continue;
            }
            validMessages.push(msg);
        }

        if (validMessages.length === 0) {
            return Response.json({ status: 'ok', processed: 0 });
        }

        // Try QStash async processing — fast 200 ack to Meta
        const qstashPayload = { requestId, messages: validMessages };
        const qstashSent = await publishToQStash(qstashPayload);

        if (qstashSent) {
                log.info('webhook-meta', `${validMessages.length} message(s) dispatched to QStash for async processing`, { requestId });
            return Response.json({ status: 'ok', processed: validMessages.length, async: true });
        }

        // Fallback: synchronous processing (no QStash configured)
        const responses = [];
        for (const msg of validMessages) {
            try {
                const businessId = await resolveBusinessByMetaId(msg.senderId, msg.platform)
                    || await resolveBusinessByMetaId(msg.recipientId, msg.platform)
                    || '00000000-0000-0000-0000-000000000001';

                const sessionId = `meta_${msg.platform}_${msg.senderId}`.slice(0, 100);

                const result = await orchestrateMaya({
                    messages: [{ role: 'user', content: msg.text }],
                    sessionId,
                    requestId,
                    source: msg.platform,
                    businessId,
                });

                if (result.content) {
                    let sendResult;
                    if (msg.platform === 'whatsapp') {
                        sendResult = await sendWhatsAppMessage(msg.senderId, result.content, msg.recipientId);
                    } else {
                        sendResult = await sendMetaMessage(msg.senderId, result.content, msg.platform);
                    }
                    responses.push({ senderId: msg.senderId?.slice(-4), platform: msg.platform, ...sendResult });
                }
            } catch (error) {
                log.error('webhook-meta', `Error processing message from ${msg.senderId?.slice(-4)}`, { requestId, error: error.message, platform: msg.platform });
                Sentry.captureException(error, { tags: { module: 'meta-webhook', requestId, platform: msg.platform } });
                responses.push({ senderId: msg.senderId?.slice(-4), platform: msg.platform, success: false, error: error.message });
            }
        }

        return Response.json({ status: 'ok', processed: responses.length, responses });
    } catch (error) {
        log.error('webhook-meta', 'Meta webhook critical error', { requestId, error: error.message });
        Sentry.captureException(error, {
            tags: { module: 'meta-webhook', code: 'CRITICAL', requestId },
        });
        return Response.json({ status: 'ok' }); // Always return 200 to Meta to prevent retries
    }
}
