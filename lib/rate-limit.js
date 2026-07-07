/**
 * In-memory sliding window rate limiter.
 *
 * WHY THIS EXISTS:
 * The chat endpoint calls DeepSeek/OpenAI on every request. Without rate
 * limiting, a malicious actor (or a misconfigured client) can spam the
 * endpoint and burn API credits. This limits each session to MAX_REQUESTS
 * requests per WINDOW_MS.
 *
 * SECURITY: The Map is capped at MAX_ENTRIES to prevent memory exhaustion.
 * An attacker could send requests with thousands of unique session IDs,
 * each creating a new entry. Without a cap, this causes OOM crashes.
 *
 * LIMITATION: This is in-memory, so it resets on server restart and doesn't
 * work across multiple instances. For production multi-instance deployments,
 * use Redis or Supabase-backed rate limiting.
 */
const requestCounts = new Map(); // sessionId -> { count, windowStart }

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 20;      // per window per session
const MAX_ENTRIES = 10000;    // prevent memory exhaustion from unique session IDs

/**
 * Returns null if allowed, or { retryAfterMs, retryAfterSec } if rate limited.
 */
export function checkRateLimit(sessionId) {
    const now = Date.now();

    // MEMORY PROTECTION: If the Map grows beyond MAX_ENTRIES, reject new sessions
    // and force cleanup. This prevents an attacker from exhausting server memory
    // by flooding unique session IDs.
    if (!requestCounts.has(sessionId) && requestCounts.size >= MAX_ENTRIES) {
        console.warn(`Rate limiter: Map full (${requestCounts.size} entries). Cleaning up.`);
        cleanupOldEntries(now);
        // If still full after cleanup, reject
        if (requestCounts.size >= MAX_ENTRIES) {
            return { retryAfterMs: WINDOW_MS, retryAfterSec: Math.ceil(WINDOW_MS / 1000) };
        }
    }

    const entry = requestCounts.get(sessionId);

    if (!entry || now - entry.windowStart > WINDOW_MS) {
        // New window
        requestCounts.set(sessionId, { count: 1, windowStart: now });
        return null;
    }

    entry.count++;

    if (entry.count > MAX_REQUESTS) {
        const retryAfterMs = WINDOW_MS - (now - entry.windowStart);
        return {
            retryAfterMs,
            retryAfterSec: Math.ceil(retryAfterMs / 1000),
        };
    }

    return null;
}

/**
 * Cleanup old entries to prevent memory leaks.
 */
function cleanupOldEntries(now) {
    for (const [sessionId, entry] of requestCounts) {
        if (now - entry.windowStart > WINDOW_MS * 2) {
            requestCounts.delete(sessionId);
        }
    }
}

// Cleanup every 5 minutes. Use .unref() so the timer doesn't prevent
// Node.js from exiting cleanly (critical for serverless/edge runtimes).
const cleanupTimer = setInterval(() => {
    cleanupOldEntries(Date.now());
}, 5 * 60 * 1000);

if (cleanupTimer.unref) {
    cleanupTimer.unref();
}
