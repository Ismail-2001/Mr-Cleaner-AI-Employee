import { OpenAI } from 'openai';
import { MAYA_SYSTEM_PROMPT } from '@/lib/ai-agent';
import { MAYA_TOOLS, executeTool } from '@/lib/tools';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { validateBody, ChatRequestSchema } from '@/lib/api-validation';

/**
 * AI CLIENT SETUP:
 * Supports Gemini (primary), DeepSeek, and OpenAI as fallbacks.
 * Gemini uses OpenAI-compatible API format via @google/generative-ai endpoint.
 *
 * WHY GEMINI:
 * - Free tier available (15 RPM, 1M tokens/day)
 * - Tool calling support (function calling)
 * - Works in Pakistan (no regional restrictions)
 */
const gemini = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY || 'dummy',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

const deepseek = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY || 'dummy',
    baseURL: 'https://api.deepseek.com',
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'dummy',
});

function getClient(model) {
    if (model.includes('gemini')) return gemini;
    if (model.includes('deepseek')) return deepseek;
    return openai;
}

const hasGemini = !!process.env.GEMINI_API_KEY;
const hasDeepSeek = !!process.env.DEEPSEEK_API_KEY;
const hasOpenAI = !!process.env.OPENAI_API_KEY;
const hasAnyAI = hasGemini || hasDeepSeek || hasOpenAI;

async function logEvent(sessionId, type, payload, requestId) {
    if (supabaseAdmin) {
        await supabaseAdmin.from('usage_logs').insert([{
            session_id: sessionId,
            event_type: type,
            payload: { ...payload, request_id: requestId }
        }]);
    }
}

export async function POST(req) {
    const requestId = crypto.randomUUID();

    // SESSION ID VALIDATION: The session ID comes from a client-provided header.
    // A malicious client could supply any session ID to read or overwrite another
    // customer's booking data. We validate format and length to prevent abuse.
    const rawSessionId = req.headers.get('x-session-id') || 'anonymous';
    const sessionId = rawSessionId === 'anonymous'
        ? 'anonymous'
        : rawSessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);

    // RATE LIMITING: Reject requests exceeding 20 per minute per session.
    const rateLimit = checkRateLimit(sessionId);
    if (rateLimit) {
        console.log(`[${requestId}] Rate limited session=${sessionId}`);
        return Response.json(
            { error: { code: 'RATE_LIMITED', message: `Try again in ${rateLimit.retryAfterSec}s.` } },
            { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } }
        );
    }

    try {
        // REQUEST VALIDATION: Reject oversized or malformed payloads before
        // they reach the LLM or business logic. A malicious client could send
        // a 10,000-message array to burn API credits.
        const body = await req.json();
        const validation = validateBody(ChatRequestSchema, body);
        if (!validation.success) {
            console.log(`[${requestId}] Validation failed:`, validation.data || 'invalid body');
            return validation.response;
        }
        const { messages: currentMessages } = validation.data;

        if (!hasAnyAI) {
            return Response.json({
                role: 'assistant',
                content: "Maya's AI engine is currently in simulation mode. Connect a Gemini API key to enable full autonomy.",
                mock: true
            });
        }

        // --- ORCHESTRATION LOOP ---
        const currentDate = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const apiMessages = [
            {
                role: "system",
                content: `${MAYA_SYSTEM_PROMPT}\n\n# CONTEXT\nToday is ${currentDate}. Use this to calculate relative dates like 'tomorrow' or 'next week'.`
            },
            ...currentMessages
        ];

        let bookingData = null;

        // BOOKING DATA PERSISTENCE FIX: Load previously collected booking data
        // from Supabase so multi-turn conversations don't lose progress.
        if (supabaseAdmin && sessionId !== 'anonymous') {
            const { data: existingSession } = await supabaseAdmin
                .from('chat_sessions')
                .select('customer_data')
                .eq('session_id', sessionId)
                .maybeSingle();
            if (existingSession?.customer_data) {
                bookingData = { ...existingSession.customer_data };
            }
        }

        let iteration = 0;
        const maxIterations = 5;

        while (iteration < maxIterations) {
            // Priority: Gemini > DeepSeek > OpenAI
            const model = hasGemini ? "gemini-2.0-flash" : hasDeepSeek ? "deepseek-chat" : "gpt-4o";
            const client = getClient(model);

            console.log(`[${requestId}] Using model: ${model} (iteration ${iteration + 1})`);

            const response = await client.chat.completions.create({
                model: model,
                messages: apiMessages,
                tools: MAYA_TOOLS,
                tool_choice: 'auto',
            });

            const assistantMessage = response.choices[0].message;
            apiMessages.push(assistantMessage);

            if (!assistantMessage.tool_calls) {
                // Final response reached
                if (supabaseAdmin && sessionId !== 'anonymous') {
                    await supabaseAdmin.from('chat_sessions').upsert({
                        session_id: sessionId,
                        customer_data: bookingData,
                        message_history: apiMessages.filter(m => m.role !== 'system'),
                        last_active: new Date().toISOString()
                    });
                }

                await logEvent(sessionId, 'chat_message', { content: assistantMessage.content }, requestId);
                return Response.json({
                    role: 'assistant',
                    content: assistantMessage.content,
                    bookingData
                });
            }

            // Execute tools safely
            for (const toolCall of assistantMessage.tool_calls) {
                const name = toolCall.function.name;
                let result;

                try {
                    const args = JSON.parse(toolCall.function.arguments);
                    result = await executeTool(name, args);

                    if (name === 'sync_booking_state') {
                        bookingData = { ...bookingData, ...args };
                    }
                    await logEvent(sessionId, 'tool_call', { tool: name, args, result }, requestId);
                } catch (e) {
                    console.error(`[${requestId}] Tool Error [${name}]:`, e.message);
                    result = JSON.stringify({ error: "Failed to process tool request", details: e.message });
                }

                apiMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: result
                });
            }

            iteration++;
        }

        throw new Error("Maximum agent iterations exceeded");

    } catch (error) {
        console.error(`[${requestId}] Critical Orchestrator Error:`, error.message);
        return Response.json({
            role: 'assistant',
            content: "I'm having a little trouble orchestrating my tools. Please try again or reach out to us directly!",
            error: { code: 'ORCHESTRATOR_ERROR', request_id: requestId }
        }, { status: 500 });
    }
}
