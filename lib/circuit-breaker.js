/**
 * Circuit breaker for AI model failover.
 *
 * WHY THIS EXISTS:
 * Without a circuit breaker, every request tries all 3 models sequentially.
 * If Gemini is down, every request wastes 10-30s timing out before falling
 * through to DeepSeek. The circuit breaker tracks consecutive failures per
 * model and skips it for a cooldown period after N failures.
 *
 * STATES:
 * CLOSED (healthy) → failure count < threshold → normal operation
 * OPEN (tripped) → failure count >= threshold → skip model, wait for cooldown
 * HALF-OPEN (testing) → cooldown expired → try one request; success → CLOSED, failure → OPEN
 *
 * CONFIGURATION:
 * - failureThreshold: consecutive failures before opening (default: 3)
 * - cooldownMs: time before retry in half-open (default: 60s)
 * - successThreshold: successes in half-open before closing (default: 1)
 *
 * PERSISTENCE: When Redis is configured, state is persisted across serverless
 * cold starts. Without Redis, falls back to in-process memory (resets on
 * cold start — acceptable for low-traffic deployments).
 */

import { tryRedisOp } from './redis';
import { log } from './logger';

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000;
const SUCCESS_THRESHOLD = 1;
const REDIS_PREFIX = 'cb:';
const REDIS_TTL_SEC = 120; // TTL for breaker state in Redis (cooldown + buffer)

export class CircuitBreaker {
    constructor(name, options = {}) {
        this.name = name;
        this.failureThreshold = options.failureThreshold ?? FAILURE_THRESHOLD;
        this.cooldownMs = options.cooldownMs ?? COOLDOWN_MS;
        this.successThreshold = options.successThreshold ?? SUCCESS_THRESHOLD;

        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = 0;
        this.probing = false; // HALF-OPEN probe guard: prevents concurrent probes
        this._loaded = false;
    }

    /**
     * Load state from Redis if available. Called lazily on first isAvailable().
     * Silently falls back to in-memory if Redis unavailable.
     */
    async _loadFromRedis() {
        if (this._loaded) return;
        this._loaded = true;

        await tryRedisOp(async (redis) => {
            const raw = await redis.get(`${REDIS_PREFIX}${this.name}`);
            if (!raw) return;
            try {
                const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
                this.state = data.state || 'CLOSED';
                this.failureCount = data.failureCount || 0;
                this.lastFailureTime = data.lastFailureTime || 0;
                // If breaker was OPEN in Redis and cooldown has passed, transition to HALF-OPEN
                if (this.state === 'OPEN' && Date.now() - this.lastFailureTime >= this.cooldownMs) {
                    this.state = 'HALF-OPEN';
                    this.successCount = 0;
                    this.probing = true;
                }
            } catch { /* corrupt data, start fresh */ }
        });
    }

    /**
     * Persist current state to Redis (fire-and-forget).
     */
    async _persistToRedis() {
        const stateData = {
            state: this.state,
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime,
        };
        await tryRedisOp(async (redis) => {
            await redis.set(`${REDIS_PREFIX}${this.name}`, stateData, { ex: REDIS_TTL_SEC });
        });
    }

    /**
     * Check if the model should be attempted.
     * @returns {boolean} true if the model is available (CLOSED or HALF-OPEN)
     */
    async isAvailable() {
        await this._loadFromRedis();

        if (this.state === 'CLOSED') return true;

        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime >= this.cooldownMs) {
                this.state = 'HALF-OPEN';
                this.successCount = 0;
                this.probing = true;
                log.info('circuit-breaker', `${this.name}: OPEN → HALF-OPEN (cooldown expired)`);
                void this._persistToRedis();
                return true;
            }
            return false;
        }

        // HALF-OPEN: only allow ONE concurrent probe
        if (this.probing) return false;
        this.probing = true;
        return true;
    }

    /**
     * Record a successful call. Resets failure count.
     */
    async recordSuccess() {
        if (this.state === 'HALF-OPEN') {
            this.successCount++;
            this.probing = false;
            if (this.successCount >= this.successThreshold) {
                this.state = 'CLOSED';
                this.failureCount = 0;
                log.info('circuit-breaker', `${this.name}: HALF-OPEN → CLOSED`);
            }
        } else {
            this.failureCount = 0;
        }
        void this._persistToRedis();
    }

    /**
     * Record a failure. Increments failure count, may trip the breaker.
     */
    async recordFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.state === 'HALF-OPEN') {
            // Failed during half-open — re-open
            this.state = 'OPEN';
            this.probing = false;
            log.warn('circuit-breaker', `${this.name}: HALF-OPEN → OPEN (retry failed)`);
        } else if (this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
            log.warn('circuit-breaker', `${this.name}: CLOSED → OPEN`, { failureCount: this.failureCount });
        }
        void this._persistToRedis();
    }

    /**
     * Get current state for health checks / logging.
     */
    getStatus() {
        return {
            name: this.name,
            state: this.state,
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
        };
    }

    /**
     * Manually reset (for testing or admin override).
     */
    async reset() {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = 0;
        this.probing = false;
        void this._persistToRedis();
    }
}

// Singleton breakers per model
const breakers = {
    gemini: new CircuitBreaker('gemini'),
    deepseek: new CircuitBreaker('deepseek'),
    openai: new CircuitBreaker('openai'),
};

/**
 * Get the circuit breaker for a model name.
 * @param {string} modelName - 'gemini' | 'deepseek' | 'openai'
 * @returns {CircuitBreaker}
 */
export function getBreaker(modelName) {
    return breakers[modelName] || new CircuitBreaker(modelName);
}

/**
 * Get status of all breakers (for health endpoint).
 */
export function getAllBreakerStatus() {
    return Object.values(breakers).map(b => b.getStatus());
}

/**
 * Reset all breakers (for testing).
 */
export async function resetAllBreakers() {
    for (const b of Object.values(breakers)) {
        await b.reset();
    }
}
