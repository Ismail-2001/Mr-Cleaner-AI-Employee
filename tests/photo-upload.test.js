import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
    stripe: null,
    createDepositSession: vi.fn().mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.com/test' }),
}));

vi.mock('@/lib/lemon-squeezy', () => ({
    isConfigured: vi.fn().mockReturnValue(false),
    createCheckout: vi.fn().mockResolvedValue({ id: 'ls_test', url: 'https://checkout.lemonsqueezy.com/test' }),
}));

vi.mock('@/lib/calendar', () => ({
    checkAvailability: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/redis', () => ({
    getRedisClient: vi.fn().mockReturnValue(null),
    tryRedisOp: vi.fn().mockResolvedValue(null),
}));

const mockCreateSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: 'https://example.com/signed/photo.jpg?token=abc123' },
    error: null,
});

vi.mock('@/lib/supabase-admin', () => ({
    supabaseAdmin: {
        storage: {
            from: vi.fn(() => ({
                upload: vi.fn().mockResolvedValue({ data: { path: 'test/photo.jpg' }, error: null }),
                createSignedUrl: (...args) => mockCreateSignedUrl(...args),
            })),
        },
        from: vi.fn(() => ({
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({ data: null }),
                    }),
                }),
            }),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
    },
}));

import { detectImageMime, getSignedPhotoUrl } from '@/lib/photo-upload';

// ─── Magic Byte Detection ────────────────────────────────────────────────────

describe('detectImageMime', () => {
    it('detects JPEG from magic bytes', () => {
        const buf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
        expect(detectImageMime(buf)).toBe('image/jpeg');
    });

    it('detects PNG from magic bytes', () => {
        const buf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]);
        expect(detectImageMime(buf)).toBe('image/png');
    });

    it('detects WebP from RIFF header', () => {
        const buf = Buffer.alloc(16);
        buf.write('RIFF', 0);
        buf.write('WEBP', 8);
        expect(detectImageMime(buf)).toBe('image/webp');
    });

    it('detects HEIC from ftyp brand', () => {
        const buf = Buffer.alloc(12);
        buf.write('ftyp', 4);
        buf.write('heic', 8);
        expect(detectImageMime(buf)).toBe('image/heic');
    });

    it('returns null for unknown format', () => {
        const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
        expect(detectImageMime(buf)).toBeNull();
    });

    it('returns null for too-short buffer', () => {
        expect(detectImageMime(Buffer.from([0xFF]))).toBeNull();
    });

    it('returns null for empty buffer', () => {
        expect(detectImageMime(Buffer.alloc(0))).toBeNull();
    });
});

// ─── Analyze Vehicle Photo Tool ──────────────────────────────────────────────

describe('analyze_vehicle_photo tool', () => {
    it('returns acknowledged status', { timeout: 15000 }, async () => {
        const { executeTool } = await import('@/lib/tools');
        const result = await executeTool('analyze_vehicle_photo', {
            photo_url: 'https://example.com/vehicle.jpg',
        }, '00000000-0000-0000-0000-000000000001');
        const parsed = JSON.parse(result);
        expect(parsed.status).toBe('acknowledged');
        expect(parsed.photo_url).toBe('https://example.com/vehicle.jpg');
    });

    it('rejects invalid URL', { timeout: 15000 }, async () => {
        const { executeTool } = await import('@/lib/tools');
        const result = await executeTool('analyze_vehicle_photo', {
            photo_url: 'not-a-url',
        }, '00000000-0000-0000-0000-000000000001');
        const parsed = JSON.parse(result);
        expect(parsed.error).toBeDefined();
    });
});

// ─── Chat Schema with Image URLs ─────────────────────────────────────────────

describe('ChatRequestSchema with image_urls', () => {
    it('accepts messages with image_urls', async () => {
        const { ChatRequestSchema } = await import('@/lib/api-validation');
        const result = ChatRequestSchema.safeParse({
            messages: [{
                role: 'user',
                content: 'Check my car',
                image_urls: ['https://example.com/car.jpg'],
            }],
        });
        expect(result.success).toBe(true);
    });

    it('rejects image_urls with invalid URLs', async () => {
        const { ChatRequestSchema } = await import('@/lib/api-validation');
        const result = ChatRequestSchema.safeParse({
            messages: [{
                role: 'user',
                content: 'Check my car',
                image_urls: ['not-a-url'],
            }],
        });
        expect(result.success).toBe(false);
    });

    it('rejects more than 5 images per message', async () => {
        const { ChatRequestSchema } = await import('@/lib/api-validation');
        const result = ChatRequestSchema.safeParse({
            messages: [{
                role: 'user',
                content: 'Check my car',
                image_urls: Array(6).fill('https://example.com/car.jpg'),
            }],
        });
        expect(result.success).toBe(false);
    });

    it('accepts messages without image_urls (backward compatible)', async () => {
        const { ChatRequestSchema } = await import('@/lib/api-validation');
        const result = ChatRequestSchema.safeParse({
            messages: [{
                role: 'user',
                content: 'Hello',
            }],
        });
        expect(result.success).toBe(true);
    });
});

// ─── Signed URL Refresh ──────────────────────────────────────────────────────

describe('getSignedPhotoUrl', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns a fresh signed URL for a valid storage path', async () => {
        const result = await getSignedPhotoUrl('session123/photo.jpg');
        expect(result.signedUrl).toBe('https://example.com/signed/photo.jpg?token=abc123');
        expect(mockCreateSignedUrl).toHaveBeenCalledWith('session123/photo.jpg', 604800);
    });

    it('returns error when storage fails', async () => {
        mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });
        const result = await getSignedPhotoUrl('nonexistent/photo.jpg');
        expect(result.error).toBeDefined();
    });
});
