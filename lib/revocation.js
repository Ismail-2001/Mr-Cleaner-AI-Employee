/**
 * Server-side session revocation.
 *
 * WHY THIS EXISTS:
 * JWTs are stateless — once issued, they're valid until expiry. When a user
 * logs out, clearing the cookie doesn't invalidate the JWT. If an attacker
 * has captured the cookie (e.g., via XSS, network sniffing on HTTP), they
 * can keep using it for up to 8 hours. This module stores revoked session
 * IDs in Supabase so middleware can reject them.
 *
 * TRADE-OFF: This adds a DB query per request to protected routes. For the
 * dashboard (low traffic), this is negligible. For high-traffic APIs, use
 * Redis with TTL instead.
 */
import { supabaseAdmin } from './supabase-admin';
import { log } from './logger';

const REVOKED_PREFIX = 'revoked_session:';
const REVOCATION_TTL_SECONDS = 8 * 60 * 60; // Match JWT expiry

/**
 * Revoke a session by its session ID.
 * Called on logout to invalidate the JWT before its natural expiry.
 */
export async function revokeSession(sessionId) {
    if (!supabaseAdmin || !sessionId) return false;

    try {
        const { error } = await supabaseAdmin.from('application_config').upsert({
            id: `${REVOKED_PREFIX}${sessionId}`,
            data: { revoked_at: new Date().toISOString() },
            updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

        if (error) {
            log.error('revocation', 'Failed to revoke session:', { error: error.message });
            return false;
        }
        return true;
    } catch (err) {
        log.error('revocation', 'Session revocation error:', { error: err.message });
        return false;
    }
}

/**
 * Check if a session has been revoked.
 * Called by middleware on every protected route request.
 * Also performs opportunistic cleanup of stale revoked entries.
 */
export async function isSessionRevoked(sessionId) {
    if (!supabaseAdmin || !sessionId) return false;

    try {
        const { data, error } = await supabaseAdmin
            .from('application_config')
            .select('id')
            .eq('id', `${REVOKED_PREFIX}${sessionId}`)
            .maybeSingle();

        // Opportunistic cleanup: purge stale revoked entries (past JWT TTL)
        void cleanupStaleRevokedEntries();

        return !error && !!data;
    } catch (err) {
        // Fail CLOSED — if we can't check revocation status, reject the request.
        // An attacker who has captured a JWT cannot use it if the revocation
        // check fails (DB down, network issue, etc.). The user must re-authenticate.
        log.error('revocation', 'Session revocation check failed — rejecting request', { error: err.message });
        return true;
    }
}

/**
 * Delete revoked session markers that have exceeded their TTL.
 * Fire-and-forget — failures are silently swallowed.
 */
async function cleanupStaleRevokedEntries() {
    try {
        const cutoff = new Date(Date.now() - REVOCATION_TTL_SECONDS * 1000).toISOString();
        await supabaseAdmin
            .from('application_config')
            .delete()
            .like('id', `${REVOKED_PREFIX}%`)
            .lt('updated_at', cutoff);
    } catch {
        // Best-effort cleanup
    }
}
