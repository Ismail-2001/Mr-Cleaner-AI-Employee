/**
 * POST /api/cron/daily-summary
 *
 * Triggered by Vercel Cron or external scheduler.
 * Sends a daily booking digest to each active business owner.
 *
 * RELIABILITY:
 * - Publishes to QStash for async processing with retries (3 attempts)
 * - Falls back to synchronous processing if QStash unavailable
 *
 * Auth: Requires CRON_SECRET header to prevent unauthorized calls.
 *
 * Cron schedule (vercel.json): "0 20 * * *" = 8 PM CT daily
 */
import { sendDailySummary } from '@/lib/twilio';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { log } from '@/lib/logger';
export async function POST(req) {
    // CRON AUTH: Only allow calls with the secret
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        log.warn('daily-summary', 'Daily summary cron: unauthorized call attempt');
        return Response.json(
            { error: { code: 'UNAUTHORIZED', message: 'Invalid or missing CRON_SECRET' } },
            { status: 401 }
        );
    }

    log.info('daily-summary', 'Daily summary cron: starting...');

    if (!supabaseAdmin) {
        log.error('daily-summary', 'Daily summary cron: no Supabase configured');
        return Response.json(
            { error: { code: 'NO_SUPABASE', message: 'Supabase not configured' } },
            { status: 500 }
        );
    }

    try {
        // Fetch all active businesses
        const { data: businesses, error: bizError } = await supabaseAdmin
            .from('businesses')
            .select('id, slug, name')
            .eq('is_active', true);

        if (bizError) {
            log.error('daily-summary', 'Daily summary cron: failed to fetch businesses', { error: bizError.message });
            return Response.json(
                { error: { code: 'DB_ERROR', message: 'Failed to fetch businesses' } },
                { status: 500 }
            );
        }

        if (!businesses || businesses.length === 0) {
            log.info('daily-summary', 'Daily summary cron: no active businesses');
            return Response.json({ success: true, count: 0 });
        }

        log.info('daily-summary', `Daily summary cron: processing ${businesses.length} business(es)`, { count: businesses.length });

        // Try QStash for reliable async processing
        const qstashToken = process.env.QSTASH_TOKEN;
        if (qstashToken) {
            try {
                const { Client } = await import('@upstash/qstash');
                const client = new Client({ token: qstashToken });
                await client.publishJSON({
                    url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://mr-cleaner.vercel.app'}/api/cron/daily-summary/process`,
                    body: { businesses },
                    retries: 3,
                });
                log.info('daily-summary', 'Daily summary cron: dispatched to QStash for async processing');
                return Response.json({ success: true, async: true, count: businesses.length });
            } catch (qstashErr) {
                log.warn('daily-summary', 'Daily summary cron: QStash publish failed, falling back to sync', { error: qstashErr.message });
            }
        }

        // Fallback: synchronous processing
        const results = [];
        for (const biz of businesses) {
            const result = await sendDailySummary(biz.id);
            results.push({ business: biz.slug, ...result });

            // Log to daily_summaries table
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

        log.info('daily-summary', 'Daily summary cron: completed', { results });
        return Response.json({ success: true, results });
    } catch (error) {
        log.error('daily-summary', 'Daily summary cron: unexpected error', { error: error.message });
        return Response.json(
            { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
            { status: 500 }
        );
    }
}

// GET for health check
export async function GET() {
    return Response.json({ status: 'ok', endpoint: 'daily-summary', method: 'POST' });
}
