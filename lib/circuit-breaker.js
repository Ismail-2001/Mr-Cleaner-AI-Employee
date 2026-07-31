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
 * MEMORY: In-process only (resets on cold start). This is acceptable because
 * Vercel cold starts are infrequent and the breaker recovers quickly.
 */

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000;
const SUCCESS_THRESHOLD = 1;

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
    }

    /**
     * Check if the model should be attempted.
     * @returns {boolean} true if the model is available (CLOSED or HALF-OPEN)
     */
    isAvailable() {
        if (this.state === 'CLOSED') return true;

        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime >= this.cooldownMs) {
                this.state = 'HALF-OPEN';
                this.successCount = 0;
                console.log(`[circuit-breaker] ${this.name}: OPEN → HALF-OPEN (cooldown expired)`);
                return true;
            }
            return false;
        }

        // HALF-OPEN: allow the attempt
        return true;
    }

    /**
     * Record a successful call. Resets failure count.
     */
    recordSuccess() {
        if (this.state === 'HALF-OPEN') {
            this.successCount++;
            if (this.successCount >= this.successThreshold) {
                this.state = 'CLOSED';
                this.failureCount = 0;
                console.log(`[circuit-breaker] ${this.name}: HALF-OPEN → CLOSED`);
            }
        } else {
            this.failureCount = 0;
        }
    }

    /**
     * Record a failure. Increments failure count, may trip the breaker.
     */
    recordFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.state === 'HALF-OPEN') {
            // Failed during half-open — re-open
            this.state = 'OPEN';
            console.warn(`[circuit-breaker] ${this.name}: HALF-OPEN → OPEN (retry failed)`);
        } else if (this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
            console.warn(`[circuit-breaker] ${this.name}: CLOSED → OPEN (${this.failureCount} consecutive failures)`);
        }
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
    reset() {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = 0;
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
export function resetAllBreakers() {
    Object.values(breakers).forEach(b => b.reset());
}
