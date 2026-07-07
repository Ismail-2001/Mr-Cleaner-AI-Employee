import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client using the service role key.
 * This bypasses RLS entirely — use ONLY in trusted server code (API routes,
 * middleware, webhooks). NEVER import this in client components.
 *
 * WHY THIS EXISTS:
 * The anon key client is subject to RLS policies, which we're locking down
 * to prevent PII leaks. Server routes (dashboard, webhook, chat) need
 * unrestricted access to read/write all tables.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error(
        'CRITICAL: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL missing. ' +
        'Admin client disabled. Dashboard, bookings, and calendar features will not work.'
    );
}

export const supabaseAdmin = (supabaseUrl && serviceRoleKey)
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })
    : null;
