/**
 * Jobber CRM Integration
 *
 * GET  /api/integrations/jobber — OAuth initiation
 * GET  /api/integrations/jobber/callback — OAuth callback
 * POST /api/integrations/jobber/webhook — Jobber webhook handler
 *
 * OAUTH FLOW:
 * 1. User clicks "Connect Jobber" in dashboard
 * 2. Redirect to /api/integrations/jobber → generates auth URL
 * 3. User authorizes → Jobber redirects to callback with code
 * 4. Exchange code for tokens → store in integrations table
 * 5. Sync bookings ↔ Jobber jobs automatically
 *
 * WEBHOOK:
 * - job.created / job.updated → sync status back to bookings table
 * - invoice.created / invoice.paid → update payment status
 */

import * as Sentry from '@sentry/nextjs';
import { getJobberAuthUrl, exchangeJobberCode, verifyJobberWebhook, parseJobberEvent, syncBookingToJobber } from '@/lib/jobber';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { tryRedisOp } from '@/lib/redis';
import { checkWebhookRateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';

// ─── Idempotency: in-memory dedup fallback ───────────────────────────────────
const dedupMemory = new Map();

// ─── GET: OAuth Initiation ───────────────────────────────────────────────────

export async function GET(req) {
    const { searchParams } = new URL(req.url);

    // Health check
    if (searchParams.get('action') === 'health') {
        return Response.json({
            status: 'ok',
            provider: 'jobber',
            configured: !!(process.env.JOBBER_CLIENT_ID && process.env.JOBBER_CLIENT_SECRET),
        });
    }

    // OAuth initiation
    const state = crypto.randomUUID();
    const authUrl = getJobberAuthUrl(state);

    // Store state in session to prevent CSRF
    if (supabaseAdmin) {
        await supabaseAdmin.from('application_config').upsert({
            id: `jobber_oauth_state_${state}`,
            data: { state, created_at: new Date().toISOString() },
        }, { onConflict: 'id' });
    }

    return Response.redirect(authUrl);
}

// ─── POST: Webhook Handler ───────────────────────────────────────────────────

export async function POST(req) {
    const requestId = crypto.randomUUID();

    // RATE LIMITING: 60 requests/min per IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || '127.0.0.1';
    const rateLimit = await checkWebhookRateLimit(ip);
    if (rateLimit) {
        console.log(`[${requestId}] Jobber webhook rate limited ip=${ip}`);
        return Response.json({ status: 'rate_limited' }, {
            status: 429,
            headers: { 'Retry-After': String(rateLimit.retryAfterSec) },
        });
    }

    try {
        const rawBody = await req.text();
        const signature = req.headers.get('x-jobber-signature');

        // Signature verification
        if (!verifyJobberWebhook(rawBody, signature)) {
            console.warn(`[${requestId}] Invalid Jobber webhook signature`);
            return Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
        }

        const body = JSON.parse(rawBody);
        const event = parseJobberEvent(body);

        if (!event) {
            return Response.json({ status: 'ok' });
        }

        console.log(`[${requestId}] Jobber event: ${event.type}`);

        // ─── Idempotency: dedup by raw body hash ─────────────────────────────────
        const dedupKey = 'jobber:dedup:' + crypto.createHash('sha256').update(rawBody).digest('hex');
        const dedupResult = await tryRedisOp(async (redis) => {
            const added = await redis.set(dedupKey, '1', { nx: true, ex: 300 });
            return added !== null;
        });
        if (dedupResult === false) {
            console.log(`[${requestId}] Duplicate Jobber event, skipping.`);
            return Response.json({ status: 'ok', duplicate: true });
        }
        if (dedupResult === null) {
            // Redis unavailable — use in-memory cache as fallback
            if (dedupMemory.has(dedupKey)) {
                console.log(`[${requestId}] Duplicate Jobber event (memory), skipping.`);
                return Response.json({ status: 'ok', duplicate: true });
            }
            dedupMemory.set(dedupKey, Date.now());
            // Evict entries older than 5 minutes
            const cutoff = Date.now() - 300_000;
            for (const [key, ts] of dedupMemory) {
                if (ts < cutoff) dedupMemory.delete(key);
            }
        }

        // Try QStash for reliable async processing
        const qstashToken = process.env.QSTASH_TOKEN;
        if (qstashToken) {
            try {
                const { Client } = await import('@upstash/qstash');
                const client = new Client({ token: qstashToken });
                await client.publishJSON({
                    url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://mr-cleaner.vercel.app'}/api/integrations/jobber/process`,
                    body: { requestId, event },
                    retries: 3,
                });
                console.log(`[${requestId}] Jobber event dispatched to QStash`);
                return Response.json({ status: 'ok', event_type: event.type, async: true });
            } catch (qstashErr) {
                console.warn(`[${requestId}] QStash publish failed, falling back to sync:`, qstashErr.message);
            }
        }

        // Fallback: synchronous processing
        await processJobberEvent(event, requestId);
        return Response.json({ status: 'ok', event_type: event.type });
    } catch (error) {
        console.error(`[${requestId}] Jobber webhook error:`, error.message);
        Sentry.captureException(error, { tags: { module: 'jobber-webhook', requestId } });
        return Response.json({ status: 'ok' }); // Always 200 to prevent retries
    }
}

// ─── Event Processing (shared between sync + async paths) ────────────────────

async function processJobberEvent(event, requestId) {
    try {
        if (event.type === 'job_update' && event.jobId && supabaseAdmin) {
            const statusMap = {
                'scheduled': 'confirmed',
                'in_progress': 'confirmed',
                'completed': 'completed',
                'cancelled': 'cancelled',
            };

            const ourStatus = statusMap[event.status];
            if (ourStatus) {
                const { data: integration } = await supabaseAdmin
                    .from('bookings')
                    .select('id')
                    .eq('jobber_job_id', event.jobId)
                    .single();

                if (integration) {
                    await supabaseAdmin
                        .from('bookings')
                        .update({ status: ourStatus })
                        .eq('id', integration.id);

                    console.log(`[${requestId}] Synced Jobber job ${event.jobId} → booking status: ${ourStatus}`);
                }
            }
        }

        if (event.type === 'invoice_update') {
            console.log(`[${requestId}] Jobber invoice ${event.invoiceId}: ${event.status}`);
        }
    } catch (error) {
        console.error(`[${requestId}] processJobberEvent error:`, error.message);
    }
}
