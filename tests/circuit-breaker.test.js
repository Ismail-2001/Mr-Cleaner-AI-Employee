import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker, getAllBreakerStatus, resetAllBreakers } from '@/lib/circuit-breaker';

vi.mock('@/lib/redis', () => ({
    tryRedisOp: vi.fn(async () => null),
}));

describe('circuit breaker', () => {
    beforeEach(async () => {
        await resetAllBreakers();
    });

    it('starts in CLOSED state', async () => {
        const breaker = new CircuitBreaker('test-a');
        expect(breaker.state).toBe('CLOSED');
        expect(await breaker.isAvailable()).toBe(true);
    });

    it('records success without tripping', async () => {
        const breaker = new CircuitBreaker('test-b');
        await breaker.recordSuccess();
        expect(breaker.state).toBe('CLOSED');
        expect(breaker.failureCount).toBe(0);
    });

    it('trips to OPEN after threshold failures', async () => {
        const breaker = new CircuitBreaker('test-c');
        await breaker.recordFailure();
        await breaker.recordFailure();
        expect(breaker.state).toBe('CLOSED');
        await breaker.recordFailure();
        expect(breaker.state).toBe('OPEN');
        expect(await breaker.isAvailable()).toBe(false);
    });

    it('resets failure count on success', async () => {
        const breaker = new CircuitBreaker('test-d');
        await breaker.recordFailure();
        await breaker.recordFailure();
        await breaker.recordSuccess();
        expect(breaker.failureCount).toBe(0);
        expect(breaker.state).toBe('CLOSED');
    });

    it('transitions to HALF-OPEN after cooldown', async () => {
        const breaker = new CircuitBreaker('test-e', { cooldownMs: 0 });
        await breaker.recordFailure();
        await breaker.recordFailure();
        await breaker.recordFailure();
        expect(breaker.state).toBe('OPEN');
        expect(await breaker.isAvailable()).toBe(true);
        expect(breaker.state).toBe('HALF-OPEN');
    });

    it('closes from HALF-OPEN on success', async () => {
        const breaker = new CircuitBreaker('test-f', { cooldownMs: 0 });
        await breaker.recordFailure();
        await breaker.recordFailure();
        await breaker.recordFailure();
        await breaker.isAvailable(); // → HALF-OPEN
        await breaker.recordSuccess();
        expect(breaker.state).toBe('CLOSED');
    });

    it('re-opens from HALF-OPEN on failure', async () => {
        const breaker = new CircuitBreaker('test-g', { cooldownMs: 0 });
        await breaker.recordFailure();
        await breaker.recordFailure();
        await breaker.recordFailure();
        await breaker.isAvailable(); // → HALF-OPEN
        await breaker.recordFailure();
        expect(breaker.state).toBe('OPEN');
    });

    it('returns status for health endpoint', () => {
        const status = getAllBreakerStatus();
        expect(status).toBeInstanceOf(Array);
        expect(status.length).toBe(3);
        expect(status[0]).toHaveProperty('name');
        expect(status[0]).toHaveProperty('state');
    });

    it('reset clears all state', async () => {
        const breaker = new CircuitBreaker('test-h');
        await breaker.recordFailure();
        await breaker.recordFailure();
        await breaker.recordFailure();
        await breaker.reset();
        expect(breaker.state).toBe('CLOSED');
        expect(breaker.failureCount).toBe(0);
    });
});
