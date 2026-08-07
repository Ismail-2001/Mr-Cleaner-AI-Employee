/**
 * Image processing utilities for vehicle photo uploads.
 *
 * WHY THIS EXISTS:
 * Customers send vehicle photos in chat for condition assessment and quoting.
 * Photos from phones can be 5-10MB. This module resizes them to a max of 1200px
 * (sufficient for AI vision analysis) and strips EXIF data to prevent PII leakage.
 *
 * PROCESSING PIPELINE:
 * 1. Validate mime type and file size (5MB max)
 * 2. Resize to max 1200px on longest edge (preserves aspect ratio)
 * 3. Strip EXIF/metadata (prevents GPS, device info leakage)
 * 4. Convert to JPEG for consistent format and smaller size
 * 5. Store in Supabase Storage under vehicle-photos/{session_id}/{uuid}.jpg
 */

import sharp from 'sharp';
import { supabaseAdmin } from './supabase-admin';
import { log } from './logger';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_DIMENSION = 1200;                   // pixels on longest edge
const JPEG_QUALITY = 82;                      // good balance of quality vs size
const ALLOWED_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
]);

/**
 * Validate and process an image buffer for storage.
 *
 * @param {Buffer} buffer - Raw image data
 * @param {string} mimeType - Content-Type from client
 * @param {string} sessionId - Chat session ID for path scoping
 * @param {string} [businessId] - Business UUID for multi-tenant scoping
 * @returns {Promise<{success: true, path, url, width, height, sizeBytes} | {success: false, error, status}>}
 */
export async function processAndUploadPhoto(buffer, mimeType, sessionId, businessId) {
    // 1. Validate mime type
    if (!ALLOWED_MIMES.has(mimeType)) {
        return {
            success: false,
            error: `Unsupported image type: ${mimeType}. Please send JPEG, PNG, or WebP.`,
            status: 400,
        };
    }

    // 2. Validate file size
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
        return {
            success: false,
            error: `Image too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Maximum is 5MB.`,
            status: 400,
        };
    }

    try {
        // 3. Process image: resize, strip metadata, convert to JPEG
        const processed = await sharp(buffer)
            .rotate() // Auto-rotate based on EXIF orientation, then strip EXIF
            .resize(MAX_DIMENSION, MAX_DIMENSION, {
                fit: 'inside',
                withoutEnlargement: true,
            })
            .jpeg({
                quality: JPEG_QUALITY,
                progressive: true,
            })
            .toBuffer({ resolveWithObject: true });

        const { data: jpegBuffer, info } = processed;

        // 4. Generate storage path
        const photoId = crypto.randomUUID();
        const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
        const storagePath = `${safeSessionId}/${photoId}.jpg`;

        // 5. Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabaseAdmin
            .storage
            .from('vehicle-photos')
            .upload(storagePath, jpegBuffer, {
                contentType: 'image/jpeg',
                upsert: false,
            });

        if (uploadError) {
            log.error('photo-upload', 'Storage error', { error: uploadError.message });
            return {
                success: false,
                error: 'Failed to store photo. Please try again.',
                status: 500,
            };
        }

        // 6. Generate signed URL (7-day expiry).
        // WHY SIGNED: Public URLs expose the Supabase storage bucket to anyone.
        // Signed URLs expire and can be refreshed on-demand — better security for
        // customer photos that may contain PII (license plates, garage interiors).
        //
        // 7 days = 604800 seconds. This balances:
        //   - Dashboard viewing of older bookings (need access to past photos)
        //   - Security (URLs don't live forever)
        //   - Cost (signed URLs are free on Supabase, no API calls needed)
        const SIGNED_URL_EXPIRY_SECONDS = 604800; // 7 days

        const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin
            .storage
            .from('vehicle-photos')
            .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);

        if (signedUrlError) {
            log.error('photo-upload', 'Signed URL error', { error: signedUrlError.message });
            return {
                success: false,
                error: 'Failed to generate photo URL. Please try again.',
                status: 500,
            };
        }

        // 7. Save metadata to database
        await supabaseAdmin.from('vehicle_photos').insert({
            session_id: sessionId,
            business_id: businessId || null,
            storage_path: storagePath,
            file_size_bytes: info.size,
            mime_type: 'image/jpeg',
            width: info.width,
            height: info.height,
        });

        return {
            success: true,
            path: storagePath,
            url: signedUrlData.signedUrl,
            width: info.width,
            height: info.height,
            sizeBytes: info.size,
        };
    } catch (err) {
        log.error('photo-upload', 'Processing error', { error: err.message });
        return {
            success: false,
            error: 'Failed to process image. Please try a different photo.',
            status: 500,
        };
    }
}

/**
 * Check if a buffer starts with known image magic bytes.
 * Basic validation before Sharp processes it.
 *
 * @param {Buffer} buffer
 * @returns {string|null} Detected mime type or null
 */
export function detectImageMime(buffer) {
    if (buffer.length < 4) return null;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'image/jpeg';
    }

    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return 'image/png';
    }

    // WebP: RIFF....WEBP
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
        return 'image/webp';
    }

    // HEIC/HEIF: ftypheic or ftypmif1
    if (buffer.toString('ascii', 4, 8) === 'ftyp') {
        const brand = buffer.toString('ascii', 8, 12);
        if (brand === 'heic' || brand === 'mif1' || brand === 'msf1') {
            return 'image/heic';
        }
    }

    return null;
}

/**
 * Generate a fresh signed URL for an existing vehicle photo.
 *
 * WHY THIS EXISTS: Signed URLs expire (default 7 days). If a dashboard user
 * views a photo from an old booking, the URL may be expired. This function
 * generates a new signed URL on-demand without re-uploading the file.
 *
 * @param {string} storagePath - The storage path (e.g., "session123/uuid.jpg")
 * @param {number} [expirySeconds=604800] - URL expiry (default 7 days)
 * @returns {Promise<{signedUrl: string} | {error: string}>}
 */
export async function getSignedPhotoUrl(storagePath, expirySeconds = 604800) {
    if (!supabaseAdmin) {
        return { error: 'Storage not configured' };
    }

    const { data, error } = await supabaseAdmin
        .storage
        .from('vehicle-photos')
        .createSignedUrl(storagePath, expirySeconds);

    if (error) {
        log.error('photo-upload', 'Failed to refresh signed URL', { error: error.message });
        return { error: 'Failed to generate photo URL' };
    }

    return { signedUrl: data.signedUrl };
}
