import * as Sentry from '@sentry/nextjs';
import { tryRedisOp } from './redis.js';
import { log } from './logger.js';

let Ratelimit = null;
let redisReady = false;

function isRedisConfigured() {
    return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function ensureRedis() {
    if (redisReady || !isRedisConfigured()) return;
    try {
        const ratelimitMod = await import('@upstash/ratelimit');
        Ratelimit = ratelimitMod.Ratelimit;
        redisReady = true;
    } catch (err) {
        console.warn('[rate-limit] Failed to load Redis modules:', err.message);
        redisReady = true;
    }
}

async function createRedisLimiter(maxRequests, windowMs) {
    await ensureRedis();
    if (!Ratelimit) return null;
    const redisClient = await tryRedisOp(client => client);
    if (!redisClient) return null;
    return new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs} ms`),
        analytics: false,
        prefix: 'rbl',
    });
}

function upstashResult(result, windowMs) {
    if (result.success) return null;
    const resetMs = typeof result.reset === 'number'
        ? (result.reset * 1000) - Date.now()
        : windowMs;
    return {
        retryAfterMs: Math.max(0, resetMs),
        retryAfterSec: Math.ceil(Math.max(0, resetMs) / 1000),
    };
}

const CHAT_WINDOW_MS = 60_000;
const CHAT_MAX = 20;
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX = 5;
const BOOKING_WINDOW_MS = 60_000;
const BOOKING_MAX = 5;
const CHAT_IP_WINDOW_MS = 60_000;
const CHAT_IP_MAX = 30;
const WEBHOOK_WINDOW_MS = 60_000;
const WEBHOOK_MAX = 60;

if (!isRedisConfigured()) {
    log.warn('rate-limit', 'Redis not configured — rate limiting disabled. NOT production-safe.');
}

let chatRedisLimiter = null;
let loginRedisLimiter = null;
let bookingRedisLimiter = null;
let chatIpRedisLimiter = null;
let webhookRedisLimiter = null;

async function getChatRedis() {
    if (isRedisConfigured() && !chatRedisLimiter) chatRedisLimiter = await createRedisLimiter(CHAT_MAX, CHAT_WINDOW_MS);
    return chatRedisLimiter;
}
async function getLoginRedis() {
    if (isRedisConfigured() && !loginRedisLimiter) loginRedisLimiter = await createRedisLimiter(LOGIN_MAX, LOGIN_WINDOW_MS);
    return loginRedisLimiter;
}
async function getBookingRedis() {
    if (isRedisConfigured() && !bookingRedisLimiter) bookingRedisLimiter = await createRedisLimiter(BOOKING_MAX, BOOKING_WINDOW_MS);
    return bookingRedisLimiter;
}
async function getChatIpRedis() {
    if (isRedisConfigured() && !chatIpRedisLimiter) chatIpRedisLimiter = await createRedisLimiter(CHAT_IP_MAX, CHAT_IP_WINDOW_MS);
    return chatIpRedisLimiter;
}
async function getWebhookRedis() {
    if (isRedisConfigured() && !webhookRedisLimiter) webhookRedisLimiter = await createRedisLimiter(WEBHOOK_MAX, WEBHOOK_WINDOW_MS);
    return webhookRedisLimiter;
}

export async function checkRateLimit(sessionId) {
    const redisLimiter = await getChatRedis();
    if (redisLimiter) {
        const result = await redisLimiter.limit(sessionId);
        return upstashResult(result, CHAT_WINDOW_MS);
    }
    Sentry.captureMessage('Rate limit check skipped — Redis unavailable', { level: 'warning', tags: { limiter: 'chat' } });
    log.warn('rate-limit', 'Rate limit check skipped — Redis unavailable', { limiter: 'chat' });
    return null;
}

export async function checkLoginRateLimit(ip) {
    const redisLimiter = await getLoginRedis();
    if (redisLimiter) {
        const result = await redisLimiter.limit(ip);
        return upstashResult(result, LOGIN_WINDOW_MS);
    }
    Sentry.captureMessage('Rate limit check skipped — Redis unavailable', { level: 'warning', tags: { limiter: 'login' } });
    log.warn('rate-limit', 'Rate limit check skipped — Redis unavailable', { limiter: 'login' });
    return null;
}

export async function checkBookingRateLimit(ip) {
    const redisLimiter = await getBookingRedis();
    if (redisLimiter) {
        const result = await redisLimiter.limit(ip);
        return upstashResult(result, BOOKING_WINDOW_MS);
    }
    Sentry.captureMessage('Rate limit check skipped — Redis unavailable', { level: 'warning', tags: { limiter: 'booking' } });
    return null;
}

export async function checkChatIpRateLimit(ip) {
    const redisLimiter = await getChatIpRedis();
    if (redisLimiter) {
        const result = await redisLimiter.limit(ip);
        return upstashResult(result, CHAT_IP_WINDOW_MS);
    }
    Sentry.captureMessage('Rate limit check skipped — Redis unavailable', { level: 'warning', tags: { limiter: 'chatIp' } });
    return null;
}

export async function checkWebhookRateLimit(ip) {
    const redisLimiter = await getWebhookRedis();
    if (redisLimiter) {
        const result = await redisLimiter.limit(ip);
        return upstashResult(result, WEBHOOK_WINDOW_MS);
    }
    Sentry.captureMessage('Rate limit check skipped — Redis unavailable', { level: 'warning', tags: { limiter: 'webhook' } });
    return null;
}

export function resetRateLimiters() {
    // No in-memory state to reset
}
