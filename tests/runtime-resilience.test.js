import { describe, it, expect, vi } from 'vitest';
import { executeTool } from '@/lib/tools';

vi.mock('@/lib/redis', () => ({
    tryRedisOp: (fn) => fn({
        get: async () => '{"sedan":999,"SUV":1111}',
        set: async () => 'OK',
        scan: async () => [0, []],
        del: async () => 1,
    }),
    getRedisClient: () => null,
}));

vi.mock('@/lib/lemon-squeezy', () => ({
    isConfigured: () => false,
    createCheckout: vi.fn(),
    createRefund: vi.fn(),
}));

describe('runtime resilience — edge cases', () => {
    it('handles null supabaseAdmin in tools without crashing', async () => {
        const result = await executeTool('calculate_quote', {
            service: 'Executive Preservation',
            vehicle_type: 'sedan',
            condition: 'standard',
        });
        const parsed = JSON.parse(result);
        expect(parsed.price).toBe(120);
        expect(parsed.currency).toBe('USD');
    });

    it('handles missing AI keys with graceful message', async () => {
        const origKeys = {
            GEMINI: process.env.GEMINI_API_KEY,
            DEEPSEEK: process.env.DEEPSEEK_API_KEY,
            OPENAI: process.env.OPENAI_API_KEY,
        };
        delete process.env.GEMINI_API_KEY;
        delete process.env.DEEPSEEK_API_KEY;
        delete process.env.OPENAI_API_KEY;

        const { orchestrateMaya } = await import('@/lib/maestro');
        const result = await orchestrateMaya({
            messages: [{ role: 'user', content: 'Hello' }],
            sessionId: 'test-resilience',
            requestId: 'test-1',
        });

        expect(result.mock).toBe(true);
        expect(typeof result.content).toBe('string');

        if (origKeys.GEMINI) process.env.GEMINI_API_KEY = origKeys.GEMINI;
        if (origKeys.DEEPSEEK) process.env.DEEPSEEK_API_KEY = origKeys.DEEPSEEK;
        if (origKeys.OPENAI) process.env.OPENAI_API_KEY = origKeys.OPENAI;
    });

    it('handles malformed cache data without crashing tools', async () => {
        const result = await executeTool('generate_deposit_link', {
            amount: 50,
            service: 'Executive Preservation',
        });
        const parsed = JSON.parse(result);
        expect(parsed.error).toBeDefined();
        expect(parsed.provider).toBeNull();
    });

    it('handles null supabaseAdmin in maestro without crashing', async () => {
        const origKeys = {
            GEMINI: process.env.GEMINI_API_KEY,
            DEEPSEEK: process.env.DEEPSEEK_API_KEY,
            OPENAI: process.env.OPENAI_API_KEY,
        };
        delete process.env.GEMINI_API_KEY;
        delete process.env.DEEPSEEK_API_KEY;
        delete process.env.OPENAI_API_KEY;

        const { orchestrateMaya } = await import('@/lib/maestro');
        const result = await orchestrateMaya({
            messages: [],
            sessionId: 'test-empty',
            requestId: 'test-2',
        });

        expect(result.mock).toBe(true);
        expect(typeof result.content).toBe('string');

        if (origKeys.GEMINI) process.env.GEMINI_API_KEY = origKeys.GEMINI;
        if (origKeys.DEEPSEEK) process.env.DEEPSEEK_API_KEY = origKeys.DEEPSEEK;
        if (origKeys.OPENAI) process.env.OPENAI_API_KEY = origKeys.OPENAI;
    });
});
