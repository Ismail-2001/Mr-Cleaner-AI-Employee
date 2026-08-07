import { describe, it, expect } from 'vitest';
import { FinalResponseSchema, validateFinalResponse } from '@/lib/output-validator';

describe('output-validator', () => {
    describe('FinalResponseSchema', () => {
        it('accepts a valid response', () => {
            const result = FinalResponseSchema.safeParse({
                content: 'Thank you for your booking!',
                language: 'en',
            });
            expect(result.success).toBe(true);
        });

        it('rejects empty content', () => {
            const result = FinalResponseSchema.safeParse({ content: '' });
            expect(result.success).toBe(false);
        });

        it('rejects content exceeding 2000 characters', () => {
            const longContent = 'x'.repeat(2001);
            const result = FinalResponseSchema.safeParse({ content: longContent });
            expect(result.success).toBe(false);
        });

        it('accepts Spanish language', () => {
            const result = FinalResponseSchema.safeParse({
                content: 'Su reserva está confirmada.',
                language: 'es',
            });
            expect(result.success).toBe(true);
            expect(result.data.language).toBe('es');
        });

        it('rejects invalid language', () => {
            const result = FinalResponseSchema.safeParse({
                content: 'Hello',
                language: 'fr',
            });
            expect(result.success).toBe(false);
        });

        it('defaults language to English', () => {
            const result = FinalResponseSchema.safeParse({ content: 'Hello' });
            expect(result.success).toBe(true);
            expect(result.data.language).toBe('en');
        });

        it('accepts optional bookingData', () => {
            const result = FinalResponseSchema.safeParse({
                content: 'Your quote is $350.',
                bookingData: { service: 'ceramic coating', price: 350 },
            });
            expect(result.success).toBe(true);
        });

        it('accepts optional error field', () => {
            const result = FinalResponseSchema.safeParse({
                content: 'Fallback message',
                error: { code: 'MAX_ITERATIONS_EXCEEDED' },
            });
            expect(result.success).toBe(true);
        });

        it('accepts optional session_id', () => {
            const result = FinalResponseSchema.safeParse({
                content: 'Hello',
                session_id: 'sess-abc123',
            });
            expect(result.success).toBe(true);
        });
    });

    describe('validateFinalResponse', () => {
        it('returns valid=true for a good response', () => {
            const result = validateFinalResponse({ content: 'Thanks!' });
            expect(result.valid).toBe(true);
            expect(result.data.content).toBe('Thanks!');
        });

        it('returns valid=false for empty content', () => {
            const result = validateFinalResponse({ content: '' });
            expect(result.valid).toBe(false);
            expect(result.error).toBeInstanceOf(Error);
        });

        it('returns valid=false for missing content', () => {
            const result = validateFinalResponse({ language: 'en' });
            expect(result.valid).toBe(false);
        });
    });
});