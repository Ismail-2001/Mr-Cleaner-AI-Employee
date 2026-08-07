import { checkRateLimit, checkChatIpRateLimit } from '@/lib/rate-limit';
import { validateBody, ChatRequestSchema } from '@/lib/api-validation';
import { orchestrateMaya } from '@/lib/maestro';
import { log } from '@/lib/logger';

const SESSION_COOKIE_NAME = 'chat_session_id';
const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{1,100}$/;

export async function POST(req) {
    // Request ID: prefer middleware-generated, fallback to new UUID
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();

    const cookieSessionId = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    const headerSessionId = req.headers.get('x-session-id');
    const rawSessionId = cookieSessionId || headerSessionId || 'anonymous';

    let sessionId;
    let isNewSession = false;

    if (rawSessionId === 'anonymous' || !rawSessionId) {
        sessionId = crypto.randomUUID().replace(/-/g, '').slice(0, 32);
        isNewSession = true;
    } else {
        sessionId = SESSION_ID_REGEX.test(rawSessionId) ? rawSessionId : 'anonymous';
    }

    const rateLimit = await checkRateLimit(sessionId);
    if (rateLimit) {
        log.info('chat', 'Rate limited', { requestId, sessionId });
        return Response.json(
            { error: { code: 'RATE_LIMITED', message: `Try again in ${rateLimit.retryAfterSec}s.` } },
            { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } }
        );
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || '127.0.0.1';
    const ipRateLimit = await checkChatIpRateLimit(ip);
    if (ipRateLimit) {
        log.info('chat', 'IP rate limited', { requestId, ip });
        return Response.json(
            { error: { code: 'IP_RATE_LIMITED', message: `Too many requests from this IP. Try again in ${ipRateLimit.retryAfterSec}s.` } },
            { status: 429, headers: { 'Retry-After': String(ipRateLimit.retryAfterSec) } }
        );
    }

    try {
        const body = await req.json();
        const validation = validateBody(ChatRequestSchema, body);
        if (!validation.success) {
            log.info('chat', 'Validation failed', { requestId, validationData: validation.data || 'invalid body' });
            return validation.response;
        }
        const { messages: currentMessages, stream } = validation.data;

        const result = await orchestrateMaya({
            messages: currentMessages,
            sessionId,
            requestId,
            source: 'web',
            req,
        });

        const isProduction = process.env.NODE_ENV === 'production';
        const cookieParts = [
            `${SESSION_COOKIE_NAME}=${sessionId}`,
            'Path=/',
            'HttpOnly',
            'SameSite=Lax',
            'Max-Age=2592000',
        ];
        if (isProduction) cookieParts.push('Secure');

        const cookieHeader = cookieParts.join('; ');

        // STREAMING: When stream=true, return SSE so the client can receive
        // the response incrementally. Currently sends the full result as a
        // single event (orchestration is not yet token-by-token), but the
        // client gets the SSE interface for future upgrades.
        if (stream) {
            const encoder = new TextEncoder();
            const streamResponse = new ReadableStream({
                start(controller) {
                    // Send session metadata first
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'session', session_id: sessionId })}\n\n`));
                    // Send the full response as a single chunk
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content: result.content, bookingData: result.bookingData, language: result.language })}\n\n`));
                    // Signal stream completion
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                },
            });

            return new Response(streamResponse, {
                status: 200,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache, no-transform',
                    'Connection': 'keep-alive',
                    'Set-Cookie': cookieHeader,
                },
            });
        }

        return Response.json(result, {
            headers: { 'Set-Cookie': cookieHeader },
        });
    } catch (error) {
        log.error('chat', 'Critical Orchestrator Error', {
            requestId,
            sessionId,
            error: error.message,
            timestamp: new Date().toISOString()
        });
        return Response.json({
            role: 'assistant',
            content: "I'm having a little trouble orchestrating my tools. Please try again or reach out to us directly!",
            error: { code: 'ORCHESTRATOR_ERROR', request_id: requestId }
        }, { status: 500 });
    }
}
