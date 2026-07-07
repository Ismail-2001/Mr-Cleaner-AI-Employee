/**
 * Startup environment validation.
 *
 * WHY THIS EXISTS:
 * Missing env vars cause confusing runtime errors (e.g., Stripe returns
 * "api_key undefined", Supabase returns "invalid API key"). This module
 * validates all critical env vars on first import and logs clear warnings.
 * It does NOT crash the server — some vars are optional for local dev.
 */

const CRITICAL_VARS = [
    { name: 'DASHBOARD_PASSWORD', description: 'Dashboard login password' },
    { name: 'DASHBOARD_SESSION_SECRET', description: 'JWT signing secret (min 32 chars)' },
    { name: 'NEXT_PUBLIC_SUPABASE_URL', description: 'Supabase project URL' },
    { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', description: 'Supabase anon key' },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', description: 'Supabase service role key (server only)' },
];

const OPTIONAL_VARS = [
    { name: 'STRIPE_SECRET_KEY', description: 'Stripe secret key (payments won\'t work without it)' },
    { name: 'STRIPE_WEBHOOK_SECRET', description: 'Stripe webhook signing secret' },
    { name: 'DEEPSEEK_API_KEY', description: 'DeepSeek API key' },
    { name: 'OPENAI_API_KEY', description: 'OpenAI API key' },
    { name: 'GOOGLE_CALENDAR_CLIENT_ID', description: 'Google Calendar OAuth client ID' },
    { name: 'GOOGLE_CALENDAR_CLIENT_SECRET', description: 'Google Calendar OAuth client secret' },
];

let validated = false;

export function validateEnv() {
    if (validated) return;
    validated = true;

    const missing = [];
    const warnings = [];

    for (const v of CRITICAL_VARS) {
        if (!process.env[v.name]) {
            missing.push(`  MISSING: ${v.name} — ${v.description}`);
        }
    }

    for (const v of OPTIONAL_VARS) {
        if (!process.env[v.name]) {
            warnings.push(`  NOT SET: ${v.name} — ${v.description}`);
        }
    }

    if (missing.length > 0) {
        console.error('\n========================================');
        console.error('CRITICAL: Missing required environment variables!');
        console.error('The application may not work correctly.\n');
        console.error(missing.join('\n'));
        console.error('========================================\n');
    }

    if (warnings.length > 0) {
        console.warn('\n--- Environment warnings (optional features disabled) ---');
        console.warn(warnings.join('\n'));
        console.warn('---\n');
    }

    // Validate session secret length
    const secret = process.env.DASHBOARD_SESSION_SECRET;
    if (secret && secret.length < 32) {
        console.warn(`WARNING: DASHBOARD_SESSION_SECRET is only ${secret.length} chars. Recommend 32+ chars for HS256 security.`);
    }
}
