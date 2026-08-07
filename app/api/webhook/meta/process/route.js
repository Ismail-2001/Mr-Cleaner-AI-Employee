/**
 * QStash Processing Endpoint — Meta Messages
 *
 * POST /api/webhook/meta/process
 *
 * Receives dispatched messages from QStash and processes them via orchestrateMaya.
 * QStash retries this endpoint up to3 times on failure.
 *
 * SECURITY: Only accepts requests from QStash (signature verification via QSTASH_SIGNING_KEY).
 * In production, verify the QStash request signature before processing.
 */

import * as Sentry from '@sentry/nextjs';
import { orchestrateMaya } from '@/lib/maestro';
import { resolveBusinessByMetaId, sendMetaMessage, sendWhatsAppMessage } from '@/lib/meta';
import { log } from '@/lib/logger';

export async function POST(req) {
    const requestId = crypto.randomUUID();

    try {
        // Verify QStash signature (required in production, optional in dev)
        const qstashSigningKey = process.env.QSTASH_SIGNING_KEY;
        if (!qstashSigningKey) {
            if (process.env.NODE_ENV === 'production') {
                log.error('meta-process', 'QSTASH_SIGNING_KEY not configured — rejecting in production', { requestId });
                return Response.json({ error: 'Server misconfigured' }, { status: 500 });
            }
            // Dev fallback: allow unsigned requests locally
        } else {
            const signature = req.headers.get('upstash-signature');
            if (!signature) {
                log.warn('meta-process', 'Missing QStash signature', { requestId });
                return Response.json({ error: 'Missing signature' }, { status: 403 });
            }
            // QStash signature verification via @upstash/qstash
            try {
                const { verify } = await import('@upstash/qstash');
                const rawBody = await req.text();
                const isValid = await verify({
                    body: rawBody,
                    signature,
                    signingKey: qstashSigningKey,
                });
                if (!isValid) {
                    log.warn('meta-process', 'Invalid QStash signature', { requestId });
                    return Response.json({ error: 'Invalid signature' }, { status: 403 });
                }
            } catch (verifyErr) {
                log.error('meta-process', 'QStash verification error', { requestId, error: verifyErr.message });
                return Response.json({ error: 'Verification failed' }, { status: 403 });
            }
        }

        const body = await req.json();
        const { requestId: originalRequestId, messages } = body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return Response.json({ status: 'ok', processed: 0 });
        }

        log.info('meta-process', `QStash: processing ${messages.length} message(s) from ${originalRequestId}`, { requestId, messageCount: messages.length });

        const responses = [];
        for (const msg of messages) {
            try {
                const businessId = await resolveBusinessByMetaId(msg.senderId, msg.platform)
                    || await resolveBusinessByMetaId(msg.recipientId, msg.platform)
                    || '00000000-0000-0000-0000-000000000001';

                const sessionId = `meta_${msg.platform}_${msg.senderId}`.slice(0, 100);

                const result = await orchestrateMaya({
                    messages: [{ role: 'user', content: msg.text }],
                    sessionId,
                    requestId: originalRequestId || requestId,
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
                log.error('meta-process', `Error processing message from ${msg.senderId?.slice(-4)}`, { requestId, error: error.message, platform: msg.platform });
                Sentry.captureException(error, {
                    tags: { module: 'meta-qstash-process', requestId, platform: msg.platform },
                });
                responses.push({ senderId: msg.senderId?.slice(-4), platform: msg.platform, success: false, error: error.message });
            }
        }

        return Response.json({ status: 'ok', processed: responses.length, responses });
    } catch (error) {
        log.error('meta-process', 'QStash process endpoint critical error', { requestId, error: error.message });
        Sentry.captureException(error, {
            tags: { module: 'meta-qstash-process', code: 'CRITICAL', requestId },
        });
        return Response.json({ status: 'error', message: error.message }, { status: 500 });
    }
}
