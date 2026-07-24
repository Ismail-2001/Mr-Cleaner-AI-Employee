/**
 * API request validation schemas and helpers.
 *
 * WHY THIS EXISTS:
 * API routes must never trust client input. A malicious client can send
 * arbitrary JSON — oversized arrays, missing fields, wrong types. Zod
 * schemas catch bad input at the boundary before it reaches business logic.
 */
import { z } from 'zod';

/**
 * Validate request body against a Zod schema.
 * Returns { success: true, data } or { success: false, response }.
 * The response is a ready-to-return Response object with 400 status.
 */
export function validateBody(schema, body) {
    const result = schema.safeParse(body);
    if (result.success) {
        return { success: true, data: result.data };
    }
    const message = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    return {
        success: false,
        response: Response.json(
            { error: { code: 'VALIDATION_ERROR', message } },
            { status: 400 }
        ),
    };
}

// --- Chat Request ---
// Prevents oversized message arrays from burning LLM credits.
export const ChatRequestSchema = z.object({
    messages: z.array(z.object({
        role: z.enum(['user', 'assistant', 'system', 'tool']),
        content: z.string().max(10000, 'Message too long'),
    })).min(1, 'At least one message required').max(50, 'Too many messages'),
});

// --- Booking Request ---
// Validates all fields before hitting the database.
export const BookingRequestSchema = z.object({
    customer_name: z.string().min(1).max(200).optional(),
    phone: z.string().max(20).optional(),
    vehicle_type: z.string().max(50).optional(),
    service: z.string().max(100).optional(),
    service_price: z.number().positive().max(10000).optional(),
    booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    booking_time: z.string().max(20).optional(),
    address: z.string().max(500).optional(),
    zip_code: z.string().max(10).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    time: z.string().max(20).optional(),
    price: z.number().positive().max(10000).optional(),
    status: z.enum(['inquiring', 'qualified', 'confirmed', 'pending']).optional(),
    sms_consent: z.boolean().optional(),
}).refine(
    data => data.booking_date || data.date,
    { message: 'Either booking_date or date is required' }
);

// --- Dashboard Auth Request ---
export const AuthRequestSchema = z.object({
    password: z.string().min(1, 'Password is required').max(500),
});
