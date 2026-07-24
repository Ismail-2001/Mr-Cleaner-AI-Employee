import { sendDailySummary } from '@/lib/twilio';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/cron/daily-summary
 *
 * Triggered by Vercel Cron or external scheduler.
 * Sends a daily booking digest to each active business owner.
 *
 * Auth: Requires CRON_SECRET header to prevent unauthorized calls.
 *
 * Cron schedule (vercel.json): "0 20 * * *" = 8 PM CT daily
 */
export async function POST(req) {
    // CRON AUTH: Only allow calls with the secret
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        console.warn('Daily summary cron: unauthorized call attempt');
        return Response.json(
            { error: { code: 'UNAUTHORIZED', message: 'Invalid or missing CRON_SECRET' } },
            { status: 401 }
        );
    }

    console.log('Daily summary cron: starting...');

    if (!supabaseAdmin) {
        console.error('Daily summary cron: no Supabase configured');
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
            console.error('Daily summary cron: failed to fetch businesses:', bizError.message);
            return Response.json(
                { error: { code: 'DB_ERROR', message: 'Failed to fetch businesses' } },
                { status: 500 }
            );
        }

        if (!businesses || businesses.length === 0) {
            console.log('Daily summary cron: no active businesses');
            return Response.json({ success: true, count: 0 });
        }

        console.log(`Daily summary cron: processing ${businesses.length} business(es)`);

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

        console.log('Daily summary cron: completed', results);
        return Response.json({ success: true, results });
    } catch (error) {
        console.error('Daily summary cron: unexpected error:', error.message);
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
