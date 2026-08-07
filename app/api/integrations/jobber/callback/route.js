/**
 * Jobber OAuth Callback
 *
 * GET /api/integrations/jobber/callback?code=xxx&state=yyy
 *
 * Handles the OAuth redirect from Jobber after user authorization.
 * Exchanges the code for tokens and stores them in the integrations table.
 */

import * as Sentry from '@sentry/nextjs';
import { exchangeJobberCode } from '@/lib/jobber';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { encrypt } from '@/lib/encrypt';
import { log } from '@/lib/logger';

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth errors
    if (error) {
        log.error('jobber-callback', 'Jobber OAuth error', { error });
        return Response.redirect(new URL('/dashboard?error=jobber_auth_failed', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));
    }

    if (!code) {
        return Response.redirect(new URL('/dashboard?error=jobber_no_code', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));
    }

    // Validate state (CSRF protection)
    if (state && supabaseAdmin) {
        const { data: storedState } = await supabaseAdmin
            .from('application_config')
            .select('data')
            .eq('id', `jobber_oauth_state_${state}`)
            .single();

        if (!storedState) {
            log.error('jobber-callback', 'Jobber OAuth: invalid state parameter');
            return Response.redirect(new URL('/dashboard?error=jobber_invalid_state', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));
        }

        // Clean up used state
        await supabaseAdmin.from('application_config').delete().eq('id', `jobber_oauth_state_${state}`);
    }

    // Exchange code for tokens
    const tokens = await exchangeJobberCode(code);
    if (!tokens) {
        log.error('jobber-callback', 'Jobber OAuth: token exchange failed');
        return Response.redirect(new URL('/dashboard?error=jobber_token_exchange_failed', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));
    }

    // Store tokens in integrations table
    if (supabaseAdmin) {
        // For now, store under the default business
        // In production, you'd resolve the business from the authenticated user
        const businessId = '00000000-0000-0000-0000-000000000001';

        await supabaseAdmin.from('integrations').upsert({
            business_id: businessId,
            provider: 'jobber',
            access_token: encrypt(tokens.accessToken),
            refresh_token: encrypt(tokens.refreshToken),
            expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
            provider_account_id: tokens.accountId,
            connected_at: new Date().toISOString(),
        }, { onConflict: 'business_id,provider' });

        log.info('jobber-callback', 'Jobber connected', { businessId, accountId: tokens.accountId });
    }

    return Response.redirect(new URL('/dashboard?success=jobber_connected', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));
}
