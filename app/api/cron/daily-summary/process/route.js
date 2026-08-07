/**
 * QStash Processing Endpoint — Daily Summary
 *
 * POST /api/cron/daily-summary/process
 *
 * Receives dispatched businesses from QStash and sends daily summaries.
 * QStash retries this endpoint up to 3 times on failure.
 *
 * SECURITY: Verify QStash signature if QSTASH_SIGNING_KEY is set.
 */

import * as Sentry from '@sentry/nextjs';
import { sendDailySummary } from '@/lib/twilio';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { log } from '@/lib/logger';

export async function POST(req) {
    const requestId = crypto.randomUUID();

    try {
        const qstashSigningKey = process.env.QSTASH_SIGNING_KEY;
        if (!qstashSigningKey) {
            if (process.env.NODE_ENV === 'production') {
                log.error('daily-summary-process', 'QSTASH_SIGNING_KEY not configured — rejecting in production', { requestId });
                return Response.json({ error: 'Server misconfigured' }, { status: 500 });
            }
        } else {
            const signature = req.headers.get('upstash-signature');
            if (!signature) {
                log.warn('daily-summary-process', 'Missing QStash signature', { requestId });
                return Response.json({ error: 'Missing signature' }, { status: 403 });
            }
            try {
                const { verify } = await import('@upstash/qstash');
                const rawBody = await req.text();
                const isValid = await verify({ body: rawBody, signature, signingKey: qstashSigningKey });
                if (!isValid) {
                    log.warn('daily-summary-process', 'Invalid QStash signature', { requestId });
                    return Response.json({ error: 'Invalid signature' }, { status: 403 });
                }
            } catch (verifyErr) {
                log.error('daily-summary-process', 'QStash verification error', { requestId, error: verifyErr.message });
                return Response.json({ error: 'Verification failed' }, { status: 403 });
            }
        }

        const body = await req.json();
        const { businesses } = body;

        if (!businesses || !Array.isArray(businesses) || businesses.length === 0) {
            return Response.json({ status: 'ok', processed: 0 });
        }

        log.info('daily-summary-process', `QStash: processing daily summary for ${businesses.length} business(es)`, { requestId, count: businesses.length });

        const results = [];
        for (const biz of businesses) {
            const result = await sendDailySummary(biz.id);
            results.push({ business: biz.slug, ...result });

            if (supabaseAdmin) {
                const today = new Date().toISOString().split('T')[0];
                await supabaseAdmin.from('daily_summaries').upsert({
                    business_id: biz.id,
                    summary_date: today,
                    booking_count: result.count || 0,
                    total_revenue: result.revenue || 0,
                    sent_via: result.method || result.reason || 'unknown',
                }, { onConflict: 'business_id,summary_date' });
            }
        }

        log.info('daily-summary-process', 'QStash: daily summary completed', { requestId, results });
        return Response.json({ status: 'ok', processed: results.length, results });
    } catch (error) {
        log.error('daily-summary-process', 'QStash daily summary process error', { requestId, error: error.message });
        Sentry.captureException(error, { tags: { module: 'daily-summary-qstash-process', requestId } });
        return Response.json({ status: 'error', message: error.message }, { status: 500 });
    }
}
