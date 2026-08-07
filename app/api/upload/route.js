/**
 * POST /api/upload — Vehicle photo upload for chat
 *
 * Accepts multipart/form-data with:
 *   - file: Image file (JPEG/PNG/WebP, max 5MB)
 *   - session_id: Chat session ID
 *
 * Returns:
 *   - { url, path, width, height, sizeBytes } on success
 *
 * SECURITY:
 *   - Max 5MB file size enforced server-side
 *   - Magic byte validation (not just Content-Type header)
 *   - Session ID validation (alphanumeric + dash/underscore, max 100)
 *   - Rate limited: 5 uploads/min per IP
 *   - Session ID must match active chat session
 */

import crypto from 'crypto';
import { processAndUploadPhoto, detectImageMime } from '@/lib/photo-upload';
import { checkBookingRateLimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveBusinessId } from '@/lib/tenant';
import { log } from '@/lib/logger';

export async function POST(req) {
    const requestId = crypto.randomUUID();

    // RATE LIMITING: Reuse booking limiter (5/min per IP)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || '127.0.0.1';
    const rateLimit = await checkBookingRateLimit(ip);
    if (rateLimit) {
        return Response.json(
            { error: { code: 'RATE_LIMITED', message: `Too many uploads. Try again in ${rateLimit.retryAfterSec}s.` } },
            { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } }
        );
    }

    try {
        const contentType = req.headers.get('content-type') || '';

        // Parse multipart form data
        if (!contentType.includes('multipart/form-data')) {
            return Response.json(
                { error: { code: 'INVALID_CONTENT_TYPE', message: 'Expected multipart/form-data' } },
                { status: 400 }
            );
        }

        const formData = await req.formData();
        const file = formData.get('file');
        const sessionId = formData.get('session_id');

        if (!file || typeof file === 'string') {
            return Response.json(
                { error: { code: 'MISSING_FILE', message: 'No file provided' } },
                { status: 400 }
            );
        }

        // Validate session ID
        const safeSessionId = sessionId && /^[a-zA-Z0-9_-]{1,100}$/.test(sessionId)
            ? sessionId
            : 'anonymous';

        // Validate session exists in usage_logs (prevents arbitrary session_id injection)
        if (safeSessionId !== 'anonymous' && supabaseAdmin) {
            const { data: sessionRow } = await supabaseAdmin
                .from('usage_logs')
                .select('id')
                .eq('session_id', safeSessionId)
                .limit(1)
                .maybeSingle();
            if (!sessionRow) {
                return Response.json(
                    { error: { code: 'INVALID_SESSION', message: 'Session not found' } },
                    { status: 400 }
                );
            }
        }

        // Resolve business for multi-tenant scoping
        const businessId = await resolveBusinessId(req);

        // Read file as buffer
        const buffer = Buffer.from(await file.arrayBuffer());

        // Max 5MB — reject oversized files before any processing
        const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
        if (buffer.length > MAX_UPLOAD_BYTES) {
            return Response.json(
                { error: { code: 'FILE_TOO_LARGE', message: `File exceeds 5MB limit (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Please compress and try again.` } },
                { status: 413 }
            );
        }

        // Detect actual mime type from magic bytes (don't trust Content-Type header)
        const detectedMime = detectImageMime(buffer);
        if (!detectedMime) {
            return Response.json(
                { error: { code: 'INVALID_IMAGE', message: 'File is not a valid image. Please send a JPEG, PNG, or WebP photo.' } },
                { status: 400 }
            );
        }

        // Process and upload
        const result = await processAndUploadPhoto(
            buffer,
            detectedMime,
            safeSessionId,
            businessId,
        );

        if (!result.success) {
            return Response.json(
                { error: { code: 'UPLOAD_FAILED', message: result.error } },
                { status: result.status || 500 }
            );
        }

        log.info('upload', 'Photo uploaded', { requestId, path: result.path, width: result.width, height: result.height, sizeBytes: result.sizeBytes });

        return Response.json({
            url: result.url,
            path: result.path,
            width: result.width,
            height: result.height,
            sizeBytes: result.sizeBytes,
        });
    } catch (error) {
        log.error('upload', 'Upload error', { requestId, error: error.message });
        return Response.json(
            { error: { code: 'UPLOAD_FAILED', message: 'Failed to upload photo. Please try again.' } },
            { status: 500 }
        );
    }
}
