import { supabaseAdmin } from '@/lib/supabase-admin';
import { log } from '@/lib/logger';

const startTime = Date.now();

/**
 * GET /api/health — Public health check endpoint.
 *
 * SECURITY: Returns minimal status only. No config details, no service
 * configuration, no circuit breaker internals. Use /api/health/verbose
 * (requires Bearer token) for operational diagnostics.
 */
export async function GET(req) {
    const requestStart = Date.now();

    const checks = {};

    // Supabase
    try {
        if (supabaseAdmin) {
            const { error } = await supabaseAdmin.from('bookings').select('id').limit(1);
            checks.supabase = error ? 'degraded' : 'connected';
        } else {
            checks.supabase = 'not_configured';
        }
    } catch {
        checks.supabase = 'unhealthy';
    }

    const values = Object.values(checks).filter(v => typeof v === 'string');
    const status = values.includes('unhealthy') ? 'degraded' : values.includes('not_configured') ? 'degraded' : 'ok';
    const httpStatus = values.includes('unhealthy') ? 503 : status === 'degraded' ? 207 : 200;

    return Response.json({
        status,
        timestamp: new Date().toISOString(),
        uptime_sec: Math.floor((Date.now() - startTime) / 1000),
        response_time_ms: Date.now() - requestStart,
    }, {
        status: httpStatus,
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
}

/**
 * POST /api/health — Verbose health check (requires Bearer token).
 *
 * Returns full diagnostics: service configs, circuit breaker states, AI
 * provider status, integration configs. For operational use only.
 */
export async function POST(req) {
    const requestStart = Date.now();

    // Auth check — requires admin secret or CRON_SECRET
    const authHeader = req.headers.get('authorization');
    const adminSecret = process.env.ADMIN_API_SECRET;
    const cronSecret = process.env.CRON_SECRET;
    const token = authHeader?.replace('Bearer ', '');

    if (!token || (token !== adminSecret && token !== cronSecret)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const checks = {};

    // Supabase
    try {
        if (supabaseAdmin) {
            const { error } = await supabaseAdmin.from('bookings').select('id').limit(1);
            checks.supabase = error ? 'degraded' : 'connected';
        } else {
            checks.supabase = 'not_configured';
        }
    } catch {
        checks.supabase = 'unhealthy';
    }

    // AI — presence only, not actual keys
    checks.ai_providers = [
        process.env.GEMINI_API_KEY ? 'gemini' : null,
        process.env.DEEPSEEK_API_KEY ? 'deepseek' : null,
        process.env.OPENAI_API_KEY ? 'openai' : null,
    ].filter(Boolean);

    // Integrations — presence only
    checks.integrations = {
        stripe: !!process.env.STRIPE_SECRET_KEY,
        lemonsqueezy: !!(process.env.LEMONSQUEEZY_API_KEY && process.env.LEMONSQUEEZY_STORE_ID),
        redis: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
        twilio: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
        resend: !!process.env.RESEND_API_KEY,
        weather: !!process.env.OPENWEATHER_API_KEY,
    };

    // Calendar
    try {
        if (supabaseAdmin) {
            const { data: tokenData } = await supabaseAdmin
                .from('application_config')
                .select('id')
                .eq('id', 'google_tokens')
                .maybeSingle();
            checks.integrations.calendar = !!tokenData;
        }
    } catch {
        checks.integrations.calendar = false;
    }

    const values = Object.values(checks).flat();
    const status = values.includes('unhealthy') ? 'degraded' : 'ok';

    return Response.json({
        status,
        timestamp: new Date().toISOString(),
        uptime_sec: Math.floor((Date.now() - startTime) / 1000),
        response_time_ms: Date.now() - requestStart,
        version: process.env.npm_package_version || '0.1.0',
        env: process.env.NODE_ENV || 'development',
        ...checks,
    }, {
        status: status === 'degraded' ? 207 : 200,
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
}
