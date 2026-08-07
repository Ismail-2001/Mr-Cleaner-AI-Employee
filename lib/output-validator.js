import { z } from 'zod';

export const FinalResponseSchema = z.object({
    content: z.string().min(1, 'Response content is required').max(2000, 'Response exceeds 2000 characters'),
    bookingData: z.record(z.unknown()).optional(),
    session_id: z.string().optional(),
    language: z.enum(['en', 'es']).default('en'),
    error: z.record(z.unknown()).optional(),
    mock: z.boolean().optional(),
});

/**
 * @typedef {z.infer<typeof FinalResponseSchema>} FinalResponse
 */

export function validateFinalResponse(raw) {
    const result = FinalResponseSchema.safeParse(raw);
    if (!result.success) {
        const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
        return { valid: false, error: new Error(`Output validation failed: ${issues}`) };
    }
    return { valid: true, data: result.data };
}