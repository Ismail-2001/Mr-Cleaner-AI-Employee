import { supabaseAdmin } from '@/lib/supabase-admin';
import { tryRedisOp } from '@/lib/redis';
import { getAllBreakerStatus } from '@/lib/circuit-breaker';

export async function GET() {
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

    // AI
    const hasGemini = !!process.env.GEMINI_API_KEY;
    const hasDeepSeek = !!process.env.DEEPSEEK_API_KEY;
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    checks.ai = hasGemini || hasDeepSeek || hasOpenAI ? 'connected' : 'not_configured';
    checks.gemini = hasGemini ? 'configured' : 'not_configured';
    checks.deepseek = hasDeepSeek ? 'configured' : 'not_configured';
    checks.openai = hasOpenAI ? 'configured' : 'not_configured';

    // Stripe
    checks.stripe = process.env.STRIPE_SECRET_KEY ? 'configured' : 'not_configured';

    // LemonSqueezy
    checks.lemonsqueezy = (process.env.LEMONSQUEEZY_API_KEY && process.env.LEMONSQUEEZY_STORE_ID)
        ? 'configured'
        : 'not_configured';

    // Redis / Upstash (rate limiting + advisory locks + caching)
    const redisOk = await tryRedisOp(r => r.set('health:ping', '1', { ex: 60 }));
    checks.redis = redisOk === true ? 'connected' : 'not_configured';

    // Dashboard auth
    checks.dashboard = (process.env.DASHBOARD_PASSWORD && process.env.DASHBOARD_SESSION_SECRET)
        ? 'configured'
        : 'not_configured';

    // Integrations
    checks.weather_api = process.env.OPENWEATHER_API_KEY ? 'configured' : 'not_configured';
    checks.twilio = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
        ? 'configured'
        : 'not_configured';
    checks.resend = process.env.RESEND_API_KEY ? 'configured' : 'not_configured';

    try {
        if (supabaseAdmin) {
            const { data: tokenData } = await supabaseAdmin
                .from('application_config')
                .select('id')
                .eq('id', 'google_tokens')
                .maybeSingle();
            checks.calendar = tokenData ? 'configured' : 'not_configured';
        } else {
            checks.calendar = 'not_configured';
        }
    } catch {
        checks.calendar = 'unhealthy';
    }

    // PII encryption
    checks.pii_encryption = process.env.ENCRYPTION_KEY ? 'configured' : 'not_configured';

    // Circuit breakers
    checks.circuit_breakers = getAllBreakerStatus();

    const values = Object.values(checks).filter(v => typeof v === 'string');
    const status = values.includes('unhealthy') ? 'degraded' : values.includes('not_configured') ? 'degraded' : 'ok';
    const httpStatus = values.includes('unhealthy') ? 503 : status === 'degraded' ? 207 : 200;

    return Response.json({
        status,
        timestamp: new Date().toISOString(),
        ...checks,
    }, {
        status: httpStatus,
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
}
