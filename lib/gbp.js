/**
 * Google Business Profile (GBP) integration utilities.
 *
 * HANDLES:
 * - Webhook verification (Google Pub/Sub push notifications)
 * - Message parsing (reviews, Q&A, customer messages)
 * - Auto-reply to reviews via GBP API
 * - Business location resolution
 *
 * GBP WEBHOOK FLOW:
 * 1. Google sends a Pub/Sub push notification to our webhook
 * 2. The notification contains a Cloud Storage object with the actual event
 * 3. We fetch the event data from the Cloud Storage URL
 * 4. Process the event (review, Q&A, message) and optionally reply
 *
 * SETUP:
 * 1. Create a Google Cloud project with Pub/Sub
 * 2. Create a subscription that pushes to our webhook URL
 * 3. Set GBP_API_KEY and GOOGLE_CLOUD_PROJECT env vars
 * 4. Verify the webhook endpoint in Google Cloud Console
 *
 * REFERENCES:
 * - https://developers.google.com/my-business/content/practical-integration
 * - https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews
 */

import * as Sentry from '@sentry/nextjs';
import { log } from './logger';

const GBP_API_KEY = process.env.GBP_API_KEY;
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const GBP_PUBSUB_VERIFICATION_TOKEN = process.env.GBP_PUBSUB_VERIFICATION_TOKEN;

// ─── Webhook Verification ────────────────────────────────────────────────────

/**
 * Verify that a webhook request is from Google Pub/Sub.
 * Google Pub/Sub push notifications include a verification token in the body.
 *
 * @param {Object} body - Parsed webhook body
 * @returns {boolean} true if verification token matches
 */
export function verifyGoogleWebhook(body) {
    if (!GBP_PUBSUB_VERIFICATION_TOKEN) {
        // SECURITY: Fail closed — never accept unverified webhooks in production.
        if (process.env.NODE_ENV === 'production') {
            log.error('gbp', 'GBP_PUBSUB_VERIFICATION_TOKEN not set — rejecting webhook (fail closed)');
            return false;
        }
        log.warn('gbp', 'GBP_PUBSUB_VERIFICATION_TOKEN not set — allowing webhook in development (INSECURE)');
        return true;
    }

    // Pub/Sub verification request
    if (body.message?.data) {
        try {
            const decoded = Buffer.from(body.message.data, 'base64').toString('utf-8');
            const data = JSON.parse(decoded);
            return data.token === GBP_PUBSUB_VERIFICATION_TOKEN;
        } catch {
            return false;
        }
    }

    // Direct verification challenge
    if (body.challenge) {
        return body.token === GBP_PUBSUB_VERIFICATION_TOKEN;
    }

    return false;
}

// ─── Event Parsing ───────────────────────────────────────────────────────────

/**
 * Parse a GBP Pub/Sub notification into a structured event.
 *
 * @param {Object} body - Raw Pub/Sub push notification body
 * @returns {Object|null} Parsed event or null if unparseable
 */
export function parseGbpNotification(body) {
    try {
        if (!body.message?.data) return null;

        const decoded = Buffer.from(body.message.data, 'base64').toString('utf-8');
        const data = JSON.parse(decoded);

        // GBP notification types
        const notificationType = data.type || data.notificationType;

        switch (notificationType) {
            case 'NEW_REVIEW':
                return {
                    type: 'review',
                    reviewId: data.reviewId,
                    accountId: data.accountId,
                    locationId: data.locationId,
                    authorName: data.review?.author?.displayName || 'Anonymous',
                    starRating: data.review?.starRating || null,
                    comment: data.review?.comment || '',
                    timestamp: data.review?.updateTime || new Date().toISOString(),
                };

            case 'NEW_QUESTION':
            case 'QUESTION_ANSWERED':
                return {
                    type: 'question',
                    questionId: data.questionId,
                    accountId: data.accountId,
                    locationId: data.locationId,
                    authorName: data.question?.author?.displayName || 'Anonymous',
                    text: data.question?.text || '',
                    timestamp: data.question?.updateTime || new Date().toISOString(),
                };

            case 'NEW_MESSAGE':
            case 'CUSTOMER_MESSAGE':
                return {
                    type: 'message',
                    messageId: data.messageId || data.conversationId,
                    accountId: data.accountId,
                    locationId: data.locationId,
                    senderName: data.message?.sender?.displayName || 'Customer',
                    text: data.message?.text || data.message?.content || '',
                    timestamp: data.message?.createTime || new Date().toISOString(),
                };

            default:
                log.info('gbp', `Unhandled GBP notification type: ${notificationType}`);
                return {
                    type: 'unknown',
                    rawType: notificationType,
                    data,
                };
        }
    } catch (error) {
        log.error('gbp', 'Failed to parse GBP notification', { error: error.message });
        return null;
    }
}

// ─── GBP API Client ──────────────────────────────────────────────────────────

/**
 * Make an authenticated request to the GBP API.
 *
 * @param {string} endpoint - API endpoint path
 * @param {Object} options - fetch options
 * @returns {Object} Parsed JSON response
 */
async function gbpApiRequest(endpoint, options = {}) {
    if (!GBP_API_KEY) {
        log.warn('gbp', 'GBP_API_KEY not set — API calls will fail');
        return null;
    }

    const url = `https://mybusinessbusinessinformation.googleapis.com/v1${endpoint}`;

    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': GBP_API_KEY,
                ...options.headers,
            },
        });

        if (!response.ok) {
            const errorBody = await response.text();
            log.error('gbp', `GBP API error ${response.status}`, { status: response.status, body: errorBody });
            Sentry.captureMessage(`GBP API error: ${response.status}`, {
                level: 'error',
                tags: { module: 'gbp', endpoint },
                extra: { status: response.status, body: errorBody },
            });
            return null;
        }

        return await response.json();
    } catch (error) {
        log.error('gbp', 'GBP API request failed', { error: error.message });
        Sentry.captureException(error, { tags: { module: 'gbp', endpoint } });
        return null;
    }
}

// ─── Review Management ───────────────────────────────────────────────────────

/**
 * Reply to a Google review.
 *
 * @param {string} accountId - Google My Business account ID
 * @param {string} locationId - Business location ID
 * @param {string} reviewId - Review ID
 * @param {string} replyText - Reply content
 * @returns {Object} { success, error? }
 */
export async function replyToReview(accountId, locationId, reviewId, replyText) {
    const endpoint = `/accounts/${accountId}/locations/${locationId}/reviews/${reviewId}/updateReply`;

    const result = await gbpApiRequest(endpoint, {
        method: 'PUT',
        body: JSON.stringify({
            comment: replyText,
        }),
    });

    if (result === null) {
        return { success: false, error: 'API request failed' };
    }

    log.info('gbp', `Replied to review ${reviewId} on location ${locationId}`);
    return { success: true };
}

/**
 * Get recent reviews for a location.
 *
 * @param {string} accountId - Google My Business account ID
 * @param {string} locationId - Business location ID
 * @param {number} pageSize - Number of reviews to fetch (default 10)
 * @returns {Array} Array of review objects
 */
export async function getReviews(accountId, locationId, pageSize = 10) {
    const endpoint = `/accounts/${accountId}/locations/${locationId}/reviews`;
    const result = await gbpApiRequest(`${endpoint}?pageSize=${pageSize}`);
    return result?.reviews || [];
}

// ─── Q&A Management ──────────────────────────────────────────────────────────

/**
 * Answer a Google Q&A question.
 *
 * @param {string} accountId - Google My Business account ID
 * @param {string} locationId - Business location ID
 * @param {string} questionId - Question ID
 * @param {string} answerText - Answer content
 * @returns {Object} { success, error? }
 */
export async function answerQuestion(accountId, locationId, questionId, answerText) {
    const endpoint = `/accounts/${accountId}/locations/${locationId}/questions/${questionId}/answers`;

    const result = await gbpApiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({
            text: answerText,
        }),
    });

    if (result === null) {
        return { success: false, error: 'API request failed' };
    }

    log.info('gbp', `Answered question ${questionId} on location ${locationId}`);
    return { success: true };
}

// ─── Business Location Resolution ────────────────────────────────────────────

/**
 * Resolve a GBP location ID to a business UUID.
 *
 * @param {string} locationId - Google location ID
 * @returns {string|null} Business UUID or null
 */
export async function resolveBusinessByGbpLocation(locationId) {
    const { supabaseAdmin } = await import('@/lib/supabase-admin');
    if (!supabaseAdmin || !locationId) return null;

    try {
        const { data } = await supabaseAdmin
            .from('businesses')
            .select('id')
            .eq('google_location_id', locationId)
            .eq('is_active', true)
            .single();

        return data?.id || null;
    } catch {
        return null;
    }
}

// ─── Auto-Reply Generation ──────────────────────────────────────────────────

/**
 * Generate an auto-reply for a review based on star rating.
 * 4-5 stars: Thank you message
 * 3 stars: Neutral acknowledgment
 * 1-2 stars: Apology + invite to resolve
 *
 * @param {Object} review - Parsed review event
 * @param {string} businessName - Business name for personalization
 * @returns {string} Reply text
 */
export function generateReviewReply(review, businessName = 'Mr. Cleaner') {
    const stars = review.starRating || 0;

    if (stars >= 4) {
        return `Thank you so much for the wonderful review, ${review.authorName}! We're thrilled you loved your ${businessName} experience. Your vehicle deserves the best, and we're honored you chose us. We look forward to serving you again! — The ${businessName} Team`;
    }

    if (stars === 3) {
        return `Thank you for your feedback, ${review.authorName}. We appreciate you taking the time to share your experience with ${businessName}. We're always working to improve, and your input helps us do that. We hope to serve you again soon!`;
    }

    return `Dear ${review.authorName}, we sincerely apologize that your ${businessName} experience didn't meet expectations. Your satisfaction is our top priority. Please reach out to us directly so we can make this right — we'd love the opportunity to restore your vehicle and your confidence in our service. Thank you for giving us a chance.`;
}
