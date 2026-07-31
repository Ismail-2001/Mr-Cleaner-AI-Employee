import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker, getAllBreakerStatus, resetAllBreakers } from '@/lib/circuit-breaker';

describe('circuit breaker', () => {
    beforeEach(() => {
        resetAllBreakers();
    });

    it('starts in CLOSED state', () => {
        const breaker = new CircuitBreaker('test-a');
        expect(breaker.state).toBe('CLOSED');
        expect(breaker.isAvailable()).toBe(true);
    });

    it('records success without tripping', () => {
        const breaker = new CircuitBreaker('test-b');
        breaker.recordSuccess();
        expect(breaker.state).toBe('CLOSED');
        expect(breaker.failureCount).toBe(0);
    });

    it('trips to OPEN after threshold failures', () => {
        const breaker = new CircuitBreaker('test-c');
        breaker.recordFailure();
        breaker.recordFailure();
        expect(breaker.state).toBe('CLOSED');
        breaker.recordFailure();
        expect(breaker.state).toBe('OPEN');
        expect(breaker.isAvailable()).toBe(false);
    });

    it('resets failure count on success', () => {
        const breaker = new CircuitBreaker('test-d');
        breaker.recordFailure();
        breaker.recordFailure();
        breaker.recordSuccess();
        expect(breaker.failureCount).toBe(0);
        expect(breaker.state).toBe('CLOSED');
    });

    it('transitions to HALF-OPEN after cooldown', () => {
        const breaker = new CircuitBreaker('test-e', { cooldownMs: 0 });
        breaker.recordFailure();
        breaker.recordFailure();
        breaker.recordFailure();
        expect(breaker.state).toBe('OPEN');
        expect(breaker.isAvailable()).toBe(true);
        expect(breaker.state).toBe('HALF-OPEN');
    });

    it('closes from HALF-OPEN on success', () => {
        const breaker = new CircuitBreaker('test-f', { cooldownMs: 0 });
        breaker.recordFailure();
        breaker.recordFailure();
        breaker.recordFailure();
        breaker.isAvailable(); // → HALF-OPEN
        breaker.recordSuccess();
        expect(breaker.state).toBe('CLOSED');
    });

    it('re-opens from HALF-OPEN on failure', () => {
        const breaker = new CircuitBreaker('test-g', { cooldownMs: 0 });
        breaker.recordFailure();
        breaker.recordFailure();
        breaker.recordFailure();
        breaker.isAvailable(); // → HALF-OPEN
        breaker.recordFailure();
        expect(breaker.state).toBe('OPEN');
    });

    it('returns status for health endpoint', () => {
        const status = getAllBreakerStatus();
        expect(status).toBeInstanceOf(Array);
        expect(status.length).toBe(3);
        expect(status[0]).toHaveProperty('name');
        expect(status[0]).toHaveProperty('state');
    });

    it('reset clears all state', () => {
        const breaker = new CircuitBreaker('test-h');
        breaker.recordFailure();
        breaker.recordFailure();
        breaker.recordFailure();
        breaker.reset();
        expect(breaker.state).toBe('CLOSED');
        expect(breaker.failureCount).toBe(0);
    });
});
