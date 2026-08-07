/**
 * QStash Processing Endpoint — Jobber Events
 *
 * POST /api/integrations/jobber/process
 *
 * Receives dispatched Jobber events from QStash and processes them.
 * QStash retries this endpoint up to 3 times on failure.
 *
 * SECURITY: Verify QStash signature if QSTASH_SIGNING_KEY is set.
 */

import * as Sentry from '@sentry/nextjs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { log } from '@/lib/logger';

export async function POST(req) {
    const requestId = crypto.randomUUID();

    try {
        const qstashSigningKey = process.env.QSTASH_SIGNING_KEY;
        if (!qstashSigningKey) {
            if (process.env.NODE_ENV === 'production') {
                log.error('jobber-process', 'QSTASH_SIGNING_KEY not configured — rejecting in production', { requestId });
                return Response.json({ error: 'Server misconfigured' }, { status: 500 });
            }
        } else {
            const signature = req.headers.get('upstash-signature');
            if (!signature) {
                log.warn('jobber-process', 'Missing QStash signature', { requestId });
                return Response.json({ error: 'Missing signature' }, { status: 403 });
            }
            try {
                const { verify } = await import('@upstash/qstash');
                const rawBody = await req.text();
                const isValid = await verify({ body: rawBody, signature, signingKey: qstashSigningKey });
                if (!isValid) {
                    log.warn('jobber-process', 'Invalid QStash signature', { requestId });
                    return Response.json({ error: 'Invalid signature' }, { status: 403 });
                }
            } catch (verifyErr) {
                log.error('jobber-process', 'QStash verification error', { requestId, error: verifyErr.message });
                return Response.json({ error: 'Verification failed' }, { status: 403 });
            }
        }

        const body = await req.json();
        const { requestId: originalRequestId, event } = body;

        if (!event) {
            return Response.json({ status: 'ok', processed: 0 });
        }

        log.info('jobber-process', 'QStash: processing Jobber event', { requestId, eventType: event.type, originalRequestId });

        // Process job updates
        if (event.type === 'job_update' && event.jobId && supabaseAdmin) {
            const statusMap = {
                'scheduled': 'confirmed',
                'in_progress': 'confirmed',
                'completed': 'completed',
                'cancelled': 'cancelled',
            };

            const ourStatus = statusMap[event.status];
            if (ourStatus) {
                const { data: integration } = await supabaseAdmin
                    .from('bookings')
                    .select('id')
                    .eq('jobber_job_id', event.jobId)
                    .single();

                if (integration) {
                    await supabaseAdmin
                        .from('bookings')
                        .update({ status: ourStatus })
                        .eq('id', integration.id);

                    log.info('jobber-process', 'Synced Jobber job to booking status', { requestId, jobId: event.jobId, status: ourStatus });
                }
            }
        }

        if (event.type === 'invoice_update') {
            log.info('jobber-process', 'Jobber invoice update', { requestId, invoiceId: event.invoiceId, status: event.status });
        }

        return Response.json({ status: 'ok', processed: 1 });
    } catch (error) {
        log.error('jobber-process', 'QStash Jobber process error', { requestId, error: error.message });
        Sentry.captureException(error, { tags: { module: 'jobber-qstash-process', requestId } });
        return Response.json({ status: 'error', message: error.message }, { status: 500 });
    }
}
