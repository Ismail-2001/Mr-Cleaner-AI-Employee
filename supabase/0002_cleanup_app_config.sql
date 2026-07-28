-- MIGRATION 0002: cleanup stale application_config entries
-- Run this in Supabase SQL Editor. Requires pg_cron extension.
-- See SUPABASE_SETUP.md for enabling pg_cron.

-- CLEANUP: Delete revoked session markers older than 24 hours
-- Sessions are revoked on logout; after 24h the JWT has expired anyway.
SELECT cron.schedule(
    'cleanup-revoked-sessions',
    '0 3 * * *',  -- 3 AM daily
    $$DELETE FROM application_config WHERE id LIKE 'revoked_session:%' AND updated_at < NOW() - INTERVAL '24 hours'$$
);

-- CLEANUP: Delete orphaned OAuth states older than 1 hour
-- These are created during Jobber OAuth flow and deleted after callback.
-- This is a safety net in case the callback never completes.
SELECT cron.schedule(
    'cleanup-orphan-oauth-states',
    '0 */2 * * *',  -- Every 2 hours
    $$DELETE FROM application_config WHERE id LIKE 'jobber_oauth_state:%' AND updated_at < NOW() - INTERVAL '1 hour'$$
);

-- CLEANUP: Delete stale Google Calendar tokens older than 90 days
-- Tokens should be refreshed regularly by the OAuth client. If they haven't
-- been refreshed in 90 days, the integration is likely abandoned.
SELECT cron.schedule(
    'cleanup-stale-google-tokens',
    '0 3 1 * *',  -- 1st of each month at 3 AM
    $$DELETE FROM application_config WHERE id = 'google_tokens' AND updated_at < NOW() - INTERVAL '90 days'$$
);
