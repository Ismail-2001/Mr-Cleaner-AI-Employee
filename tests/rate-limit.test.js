import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLimit, mockSlidingWindow } = vi.hoisted(() => {
    const mockLimit = vi.fn();
    const mockSlidingWindow = vi.fn();
    return { mockLimit, mockSlidingWindow };
});

vi.mock('@upstash/ratelimit', () => {
    class MockRatelimit {
        constructor() {}
        limit(key) { return mockLimit(key); }
        static slidingWindow(...args) { return mockSlidingWindow(...args); }
    }
    return { Ratelimit: MockRatelimit };
});

vi.mock('@/lib/redis', () => ({
    tryRedisOp: vi.fn((fn) => {
        const dummyClient = { pipeline: () => ({ incr: vi.fn(), expire: vi.fn(), exec: vi.fn() }) };
        return fn(dummyClient);
    }),
}));

// Set env vars so rate-limit module initializes Redis path
beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
});

import {
    checkRateLimit,
    checkLoginRateLimit,
    checkBookingRateLimit,
    checkChatIpRateLimit,
    checkWebhookRateLimit,
    resetRateLimiters,
} from '@/lib/rate-limit';

function makePass() {
    return { success: true, limit: 0, remaining: 0, reset: 0 };
}
function makeBlock(limit) {
    return { success: false, limit, remaining: 0, reset: Math.floor(Date.now() / 1000) + 60 };
}

describe('Chat Rate Limiter (Redis)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetRateLimiters();
    });

    it('allows first request', async () => {
        mockLimit.mockResolvedValue(makePass());
        expect(await checkRateLimit('session-1')).toBeNull();
    });

    it('allows up to 20 requests per window', async () => {
        mockLimit.mockResolvedValue(makePass());
        for (let i = 0; i < 20; i++) {
            expect(await checkRateLimit('session-1')).toBeNull();
        }
    });

    it('blocks on 21st request', async () => {
        mockLimit.mockResolvedValue(makePass());
        for (let i = 0; i < 20; i++) {
            await checkRateLimit('session-1');
        }
        mockLimit.mockResolvedValue(makeBlock(20));
        const result = await checkRateLimit('session-1');
        expect(result).not.toBeNull();
        expect(result.retryAfterSec).toBeGreaterThan(0);
        expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('tracks different sessions independently', async () => {
        mockLimit.mockResolvedValue(makePass());
        expect(await checkRateLimit('session-b')).toBeNull();
        mockLimit.mockResolvedValue(makeBlock(20));
        expect(await checkRateLimit('session-a')).not.toBeNull();
    });
});

describe('Login Rate Limiter (Redis)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetRateLimiters();
    });

    it('allows first login attempt', async () => {
        mockLimit.mockResolvedValue(makePass());
        expect(await checkLoginRateLimit('192.168.1.1')).toBeNull();
    });

    it('allows up to 5 attempts', async () => {
        mockLimit.mockResolvedValue(makePass());
        for (let i = 0; i < 5; i++) {
            expect(await checkLoginRateLimit('192.168.1.1')).toBeNull();
        }
    });

    it('blocks on 6th attempt', async () => {
        mockLimit.mockResolvedValue(makePass());
        for (let i = 0; i < 5; i++) {
            await checkLoginRateLimit('192.168.1.1');
        }
        mockLimit.mockResolvedValue(makeBlock(5));
        const result = await checkLoginRateLimit('192.168.1.1');
        expect(result).not.toBeNull();
        expect(result.retryAfterSec).toBeGreaterThan(0);
    });

    it('tracks different IPs independently', async () => {
        mockLimit.mockResolvedValue(makePass());
        for (let i = 0; i < 5; i++) {
            await checkLoginRateLimit('192.168.1.1');
        }
        mockLimit.mockResolvedValue(makePass());
        expect(await checkLoginRateLimit('10.0.0.1')).toBeNull();
    });
});

describe('Booking Rate Limiter (Redis)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetRateLimiters();
    });

    it('allows first booking request', async () => {
        mockLimit.mockResolvedValue(makePass());
        expect(await checkBookingRateLimit('192.168.1.1')).toBeNull();
    });

    it('allows up to 5 requests', async () => {
        mockLimit.mockResolvedValue(makePass());
        for (let i = 0; i < 5; i++) {
            expect(await checkBookingRateLimit('192.168.1.1')).toBeNull();
        }
    });

    it('blocks on 6th request', async () => {
        mockLimit.mockResolvedValue(makePass());
        for (let i = 0; i < 5; i++) {
            await checkBookingRateLimit('192.168.1.1');
        }
        mockLimit.mockResolvedValue(makeBlock(5));
        const result = await checkBookingRateLimit('192.168.1.1');
        expect(result).not.toBeNull();
    });
});

describe('Chat IP Rate Limiter (Redis)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetRateLimiters();
    });

    it('allows first request from IP', async () => {
        mockLimit.mockResolvedValue(makePass());
        expect(await checkChatIpRateLimit('203.0.113.1')).toBeNull();
    });

    it('allows up to 30 requests from same IP', async () => {
        mockLimit.mockResolvedValue(makePass());
        for (let i = 0; i < 30; i++) {
            expect(await checkChatIpRateLimit('203.0.113.1')).toBeNull();
        }
    });

    it('blocks on 31st request', async () => {
        mockLimit.mockResolvedValue(makePass());
        for (let i = 0; i < 30; i++) {
            await checkChatIpRateLimit('203.0.113.1');
        }
        mockLimit.mockResolvedValue(makeBlock(30));
        const result = await checkChatIpRateLimit('203.0.113.1');
        expect(result).not.toBeNull();
        expect(result.retryAfterSec).toBeGreaterThan(0);
    });
});

describe('Webhook Rate Limiter (Redis)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetRateLimiters();
    });

    it('allows first webhook request', async () => {
        mockLimit.mockResolvedValue(makePass());
        expect(await checkWebhookRateLimit('10.0.0.1')).toBeNull();
    });

    it('allows up to 60 requests per minute', async () => {
        mockLimit.mockResolvedValue(makePass());
        for (let i = 0; i < 60; i++) {
            expect(await checkWebhookRateLimit('10.0.0.1')).toBeNull();
        }
    });

    it('blocks on 61st request', async () => {
        mockLimit.mockResolvedValue(makePass());
        for (let i = 0; i < 60; i++) {
            await checkWebhookRateLimit('10.0.0.1');
        }
        mockLimit.mockResolvedValue(makeBlock(60));
        const result = await checkWebhookRateLimit('10.0.0.1');
        expect(result).not.toBeNull();
    });
});
