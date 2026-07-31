const USE_REDIS = process.env.USE_REDIS !== 'false' && !!process.env.UPSTASH_REDIS_REST_URL;
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;

let redis = null;
let redisModulePromise = null;

function getRedisClient() {
    if (!USE_REDIS || !REDIS_URL) return null;
    if (redis) return redis;

    // Lazy-load @upstash/redis (only when actually needed)
    if (!redisModulePromise) {
        redisModulePromise = import('@upstash/redis').then(({ Redis }) => {
            redis = new Redis({
                url: REDIS_URL,
                token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
                retry: { retries: 2, backoff: (attempt) => Math.min(1000 * 2 ** attempt, 10000) },
            });
            return redis;
        }).catch(() => null);
    }

    // Return null synchronously if Redis isn't loaded yet
    // tryRedisOp handles the async path
    return null;
}

async function tryRedisOp(op) {
    if (!USE_REDIS || !REDIS_URL) return null;

    try {
        if (!redisModulePromise) {
            redisModulePromise = import('@upstash/redis').then(({ Redis }) => {
                redis = new Redis({
                    url: REDIS_URL,
                    token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
                    retry: { retries: 2, backoff: (attempt) => Math.min(1000 * 2 ** attempt, 10000) },
                });
                return redis;
            }).catch(() => null);
        }
        const client = await redisModulePromise;
        if (!client) return null;
        return await op(client);
    } catch {
        return null;
    }
}

export { getRedisClient, tryRedisOp };
