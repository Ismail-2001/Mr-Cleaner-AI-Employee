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
    { name: 'GEMINI_API_KEY', description: 'Gemini API key (primary AI engine)' },
    { name: 'STRIPE_SECRET_KEY', description: 'Stripe secret key (payments won\'t work without it)' },
    { name: 'STRIPE_WEBHOOK_SECRET', description: 'Stripe webhook signing secret' },
    { name: 'DEEPSEEK_API_KEY', description: 'DeepSeek API key' },
    { name: 'OPENAI_API_KEY', description: 'OpenAI API key' },
    { name: 'OPENWEATHER_API_KEY', description: 'OpenWeatherMap API key (real weather forecasts, free tier: 1000/day)' },
];

// Paired vars — both must be set together for the feature to work
const PAIRED_VARS = {
    'GOOGLE_CALENDAR': {
        vars: ['GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET'],
        description: 'Google Calendar OAuth (both CLIENT_ID and CLIENT_SECRET required)',
        setupUrl: 'https://console.cloud.google.com/apis/credentials',
    },
};

import { log } from './logger';

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

    // Check paired vars — both must be set or both must be empty
    for (const [feature, config] of Object.entries(PAIRED_VARS)) {
        const setVars = config.vars.filter(v => process.env[v]);
        const missingVars = config.vars.filter(v => !process.env[v]);

        if (setVars.length > 0 && missingVars.length > 0) {
            // Partially configured — this causes runtime errors
            log.error('validate-env', `PARTIAL CONFIGURATION: ${feature}`, {
                set: setVars.join(', '),
                missing: missingVars.join(', '),
                description: config.description,
                setupUrl: config.setupUrl,
                note: 'Both must be set together or the OAuth flow will fail.',
            });
        } else if (missingVars.length === config.vars.length) {
            warnings.push(`  NOT SET: ${config.vars.join(' + ')} — ${config.description}`);
        }
    }

    if (missing.length > 0) {
        log.error('validate-env', 'CRITICAL: Missing required environment variables!', {
            missing: missing.join('\n'),
            note: 'The application may not work correctly.',
        });

        // In production, fail closed — do not start with missing critical vars
        if (process.env.NODE_ENV === 'production') {
            throw new Error(
                `FATAL: Missing critical environment variables in production:\n${missing.join('\n')}\n` +
                'Set these before deploying. See .env.example for reference.'
            );
        }
    }

    if (warnings.length > 0) {
        log.warn('validate-env', 'Environment warnings (optional features disabled)', {
            warnings: warnings.join('\n'),
        });
    }

    // Validate session secret length
    const secret = process.env.DASHBOARD_SESSION_SECRET;
    if (secret && secret.length < 32) {
        log.warn('validate-env', `DASHBOARD_SESSION_SECRET is only ${secret.length} chars. Recommend 32+ chars for HS256 security.`);
    }
}
