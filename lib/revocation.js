/**
 * Server-side session revocation.
 *
 * WHY THIS EXISTS:
 * JWTs are stateless — once issued, they're valid until expiry. When a user
 * logs out, clearing the cookie doesn't invalidate the JWT. If an attacker
 * has captured the cookie (e.g., via XSS, network sniffing on HTTP), they
 * can keep using it for up to 8 hours. This module stores revoked session
 * IDs so middleware can reject them.
 *
 * PERSISTENCE: Redis-first with Supabase fallback. Redis makes revocation
 * checks O(1) per request (vs Supabase query). Without Redis, falls back
 * to Supabase application_config table.
 */
import { supabaseAdmin } from './supabase-admin';
import { tryRedisOp } from './redis';
import { log } from './logger';

const REVOKED_PREFIX = 'revoked_session:';
const REVOCATION_TTL_SECONDS = 8 * 60 * 60; // Match JWT expiry

/**
 * Revoke a session by its session ID.
 * Called on logout to invalidate the JWT before its natural expiry.
 * Writes to both Redis (fast lookup) and Supabase (durable backup).
 */
export async function revokeSession(sessionId) {
    if (!sessionId) return false;

    // Write to Redis (fast path for middleware checks)
    const redisWritten = await tryRedisOp(async (redis) => {
        await redis.set(`${REVOKED_PREFIX}${sessionId}`, '1', { ex: REVOCATION_TTL_SECONDS });
        return true;
    });

    // Write to Supabase (durable backup, survives Redis flush)
    if (supabaseAdmin) {
        try {
            const { error } = await supabaseAdmin.from('application_config').upsert({
                id: `${REVOKED_PREFIX}${sessionId}`,
                data: { revoked_at: new Date().toISOString() },
                updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });

            if (error) {
                log.error('revocation', 'Failed to revoke session in DB', { error: error.message });
            }
        } catch (err) {
            log.error('revocation', 'Session revocation error', { error: err.message });
        }
    }

    return redisWritten !== null || !!supabaseAdmin;
}

/**
 * Check if a session has been revoked.
 * Called by middleware on every protected route request.
 * Redis-first: O(1) lookup. Falls back to Supabase if Redis unavailable.
 */
export async function isSessionRevoked(sessionId) {
    if (!sessionId) return false;

    // Fast path: check Redis
    const redisResult = await tryRedisOp(async (redis) => {
        const exists = await redis.exists(`${REVOKED_PREFIX}${sessionId}`);
        return exists;
    });

    if (redisResult !== null) {
        return redisResult === 1;
    }

    // Fallback: check Supabase
    if (!supabaseAdmin) return false;

    try {
        const { data, error } = await supabaseAdmin
            .from('application_config')
            .select('id')
            .eq('id', `${REVOKED_PREFIX}${sessionId}`)
            .maybeSingle();

        return !error && !!data;
    } catch (err) {
        // Fail CLOSED — if we can't check revocation status, reject the request.
        log.error('revocation', 'Session revocation check failed — rejecting request', { error: err.message });
        return true;
    }
}
