/**
 * Google Business Profile Webhook
 *
 * POST /api/webhook/google — GBP notifications (reviews, Q&A, messages)
 *
 * SECURITY:
 * - Pub/Sub verification token validation
 * - Cloud Storage object fetching for event data
 * - Rate limiting: 60 req/min per IP
 *
 * HANDLES:
 * - NEW_REVIEW → auto-reply based on star rating
 * - NEW_QUESTION → forward to Maya for response
 * - CUSTOMER_MESSAGE → forward to Maya conversation
 *
 * SETUP:
 * 1. Create Google Cloud project with Pub/Sub
 * 2. Create push subscription pointing to this endpoint
 * 3. Set GBP_PUBSUB_VERIFICATION_TOKEN env var
 */

import * as Sentry from '@sentry/nextjs';
import { verifyGoogleWebhook, parseGbpNotification, replyToReview, generateReviewReply, resolveBusinessByGbpLocation } from '@/lib/gbp';
import { orchestrateMaya } from '@/lib/maestro';
import { checkWebhookRateLimit } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

// ─── POST: Notification Handler ──────────────────────────────────────────────

export async function POST(req) {
    const requestId = crypto.randomUUID();

    // RATE LIMITING
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || '127.0.0.1';

    const rateLimit = await checkWebhookRateLimit(ip);
    if (rateLimit) {
        log.info('google-webhook', 'GBP webhook rate limited', { requestId, ip });
        return Response.json({ status: 'rate_limited' }, { status: 429 });
    }

    try {
        const body = await req.json();

        // Handle Pub/Sub subscription confirmation
        // Google sends a GET-like verification challenge via POST with message.data containing a base64 token
        if (body.message?.attributes?.type === 'url_verification') {
            const decoded = Buffer.from(body.message.data, 'base64').toString('utf-8');
            try {
                const data = JSON.parse(decoded);
                if (data.token === process.env.GBP_PUBSUB_VERIFICATION_TOKEN) {
                    return Response.json({ token: data.token });
                }
            } catch {
                // Fall through to normal processing
            }
        }

        // Verify webhook authenticity
        if (!verifyGoogleWebhook(body)) {
            log.warn('google-webhook', 'Invalid Google webhook', { requestId, ip });
            return Response.json({ error: { code: 'FORBIDDEN', message: 'Invalid verification' } }, { status: 403 });
        }

        // Parse the notification
        const event = parseGbpNotification(body);
        if (!event) {
            log.info('google-webhook', 'Unparseable GBP notification', { requestId });
            return Response.json({ status: 'ok' });
        }

        log.info('google-webhook', `GBP event: ${event.type} from location ${event.locationId}`, { requestId });

        // Resolve business from GBP location ID
        const businessId = await resolveBusinessByGbpLocation(event.locationId)
            || '00000000-0000-0000-0000-000000000001';

        // Process by event type
        switch (event.type) {
            case 'review':
                await handleReview(event, businessId, requestId);
                break;

            case 'question':
                await handleQuestion(event, businessId, requestId);
                break;

            case 'message':
                await handleMessage(event, businessId, requestId);
                break;

            default:
                log.info('google-webhook', `Ignoring GBP event type: ${event.type}`, { requestId });
        }

        return Response.json({ status: 'ok', event_type: event.type });
    } catch (error) {
        log.error('google-webhook', 'GBP webhook critical error', { requestId, error: error.message });
        Sentry.captureException(error, {
            tags: { module: 'gbp-webhook', code: 'CRITICAL', requestId },
        });
        // Always return 200 to prevent Google from retrying
        return Response.json({ status: 'ok' });
    }
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

async function handleReview(event, businessId, requestId) {
    try {
        // Auto-reply to the review
        if (event.starRating && event.reviewId) {
            const reply = generateReviewReply(event, process.env.BUSINESS_NAME || 'Mr. Cleaner');
            const replyResult = await replyToReview(
                event.accountId,
                event.locationId,
                event.reviewId,
                reply
            );

            if (replyResult.success) {
                log.info('google-webhook', `Auto-replied to review ${event.reviewId} (${event.starRating} stars)`, { requestId });
            } else {
                log.error('google-webhook', 'Failed to reply to review', { requestId, error: replyResult.error });
            }
        }

        // Forward negative reviews to Maya for follow-up
        if (event.starRating && event.starRating <= 2) {
            const sessionId = `gbp_review_${event.reviewId}`.slice(0, 100);
            await orchestrateMaya({
                messages: [{
                    role: 'user',
                    content: `A customer left a ${event.starRating}-star review on Google: "${event.comment}". Author: ${event.authorName}. Please help me craft a thoughtful response to address their concerns and show we care about their experience.`,
                }],
                sessionId,
                requestId,
                source: 'google_review',
                businessId,
            });
        }
    } catch (error) {
        log.error('google-webhook', 'Review handler error', { requestId, error: error.message });
    }
}

async function handleQuestion(event, businessId, requestId) {
    try {
        // Forward Q&A to Maya for response
        const sessionId = `gbp_question_${event.questionId}`.slice(0, 100);
        const result = await orchestrateMaya({
            messages: [{
                role: 'user',
                content: `A customer asked a question on Google: "${event.text}". Author: ${event.authorName}. Please provide a helpful response.`,
            }],
            sessionId,
            requestId,
            source: 'google_qa',
            businessId,
        });

        log.info('google-webhook', `Maya generated Q&A response for question ${event.questionId}`, { requestId });
    } catch (error) {
        log.error('google-webhook', 'Q&A handler error', { requestId, error: error.message });
    }
}

async function handleMessage(event, businessId, requestId) {
    try {
        // Forward customer message to Maya
        const sessionId = `gbp_msg_${event.senderId || event.messageId}`.slice(0, 100);
        const result = await orchestrateMaya({
            messages: [{
                role: 'user',
                content: event.text,
            }],
            sessionId,
            requestId,
            source: 'google_message',
            businessId,
        });

        log.info('google-webhook', `Maya processed GBP message from ${event.senderName}`, { requestId });
    } catch (error) {
        log.error('google-webhook', 'Message handler error', { requestId, error: error.message });
    }
}

// ─── GET: Health Check ───────────────────────────────────────────────────────

export async function GET() {
    return Response.json({
        status: 'ok',
        endpoint: 'google-webhook',
        method: 'POST',
        documentation: 'Configure Pub/Sub push subscription to POST here',
    });
}
