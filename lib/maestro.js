/**
 * Maya Orchestration Engine — shared by all channels (web, Messenger, Instagram).
 *
 * WHY THIS EXISTS:
 * The chat route had all orchestration logic inline. When we added Meta Messenger
 * support, we'd duplicate 200+ lines. This module extracts the core loop so every
 * channel gets the same AI behavior, tool execution, and session persistence.
 *
 * CHANNELS:
 * - Web: POST /api/chat → orchestrateMaya({ messages, sessionId, ... })
 * - Messenger: POST /api/webhook/meta → orchestrateMaya({ messages, sessionId, ... })
 * - Instagram: same webhook, different sender ID format
 */

import { OpenAI } from 'openai';
import { buildSystemPrompt, detectLanguage, detectPromptInjection } from '@/lib/ai-agent';
import { MAYA_TOOLS, executeTool } from '@/lib/tools';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withTimeout, withAbortTimeout, DEFAULT_TIMEOUT_MS } from '@/lib/timeout';
import { resolveBusinessId, getBusinessConfig } from '@/lib/tenant';
import { redactToolArgs } from '@/lib/pii-redact';
import { getBreaker } from '@/lib/circuit-breaker';
import { log } from '@/lib/logger';
import * as Sentry from '@sentry/nextjs';

// ─── AI Client Setup ─────────────────────────────────────────────────────────

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

const hasGemini = !!process.env.GEMINI_API_KEY;
const hasDeepSeek = !!process.env.DEEPSEEK_API_KEY;
const hasOpenAI = !!process.env.OPENAI_API_KEY;
const hasAnyAI = hasGemini || hasDeepSeek || hasOpenAI;

// ─── Logging ─────────────────────────────────────────────────────────────────

async function logEvent(sessionId, type, payload, requestId) {
    if (supabaseAdmin) {
        try {
            await supabaseAdmin.from('usage_logs').insert([{
                session_id: sessionId,
                event_type: type,
                payload: { ...payload, request_id: requestId }
            }]);
        } catch (err) {
            log.error('maestro', 'Log event failed', { error: err.message, sessionId, eventType: type, requestId });
            Sentry.captureException(err, {
                tags: { module: 'maestro', method: 'logEvent' },
                extra: { sessionId, eventType: type, requestId },
            });
        }
    }
}

// ─── Conversation Pruning ─────────────────────────────────────────────────────

/**
 * Maximum number of context messages (user + assistant + tool) to send to the
 * LLM per iteration. System prompt is always included separately.
 *
 * WHY 20: Balances cost ($0.01-0.03 per conversation at Gemini Flash pricing)
 * with sufficient context for multi-step booking flows. Tune based on real
 * conversation quality data — if the AI starts losing context on long bookings,
 * increase this. If costs spike, decrease it.
 */
const MAX_CONTEXT_MESSAGES = 20;

/**
 * Trim conversation history to the last N messages while preserving tool-call
 * and tool-result pair integrity.
 *
 * WHY THIS MATTERS: LLMs expect tool-result messages to follow their matching
 * tool-call. If we naively slice the array, a tool-call from iteration 3 might
 * survive but its tool-result gets dropped — causing an orphan that some models
 * interpret as an error or hallucinate a response for.
 *
 * @param {Array} messages - Full conversation history (role, content, tool_calls, etc.)
 * @param {number} maxMessages - Maximum messages to keep (default: MAX_CONTEXT_MESSAGES)
 * @returns {Array} Trimmed messages with intact tool pairs
 */
export function pruneConversationHistory(messages, maxMessages = MAX_CONTEXT_MESSAGES) {
    if (maxMessages <= 0) return [];
    if (messages.length <= maxMessages) return messages;

    let cutIndex = messages.length - maxMessages;

    // Walk backward from the cut point to find a safe position.
    // A position is unsafe when:
    //   1. The message at cutIndex is a tool result — its matching tool_call
    //      would be excluded, creating an orphan.
    //   2. The message at cutIndex-1 is an assistant with tool_calls, but
    //      the tool result (at cutIndex) would be excluded from the window.
    // We keep pulling cutIndex back until we find a safe boundary.
    while (cutIndex > 0) {
        const msgAtCut = messages[cutIndex];
        const prevMsg = cutIndex > 0 ? messages[cutIndex - 1] : null;

        let pulledBack = false;

        // Case 1: Cutting at a tool result — pull back to include it + its tool_call
        if (msgAtCut.role === 'tool') {
            cutIndex--;
            pulledBack = true;
        }

        // Case 2: Previous message is assistant with tool_calls, but result is being cut
        if (!pulledBack && prevMsg && prevMsg.role === 'assistant' && prevMsg.tool_calls?.length > 0) {
            cutIndex--;
            pulledBack = true;
        }

        if (!pulledBack) break;
    }

    return messages.slice(cutIndex);
}

// ─── Core Orchestration ──────────────────────────────────────────────────────

/**
 * Run the Maya orchestration loop. Shared by all channels.
 *
 * @param {Object} options
 * @param {Array} options.messages - Conversation history [{ role, content }]
 * @param {string} options.sessionId - Session identifier
 * @param {string} options.requestId - Request trace ID
 * @param {string} [options.source='web'] - Channel: 'web' | 'messenger' | 'instagram'
 * @param {string} [options.businessId] - Business UUID (resolved from request if not provided)
 * @param {Object} [options.req] - Next.js Request (for businessId resolution)
 * @returns {Object} { content, bookingData, session_id, error? }
 */
export async function orchestrateMaya({
    messages: currentMessages,
    sessionId,
    requestId,
    source = 'web',
    businessId: providedBusinessId,
    req,
}) {
    let sessionLanguage = 'en';

    if (!hasAnyAI) {
        const simMsg = sessionLanguage === 'es'
            ? "El motor de IA de Maya está actualmente en modo de simulación. Conecte una clave API de Gemini para habilitar la autonomía completa."
            : "Maya's AI engine is currently in simulation mode. Connect a Gemini API key to enable full autonomy.";
        return {
            role: 'assistant',
            content: simMsg,
            mock: true,
            language: sessionLanguage,
        };
    }

    // Resolve business
    const businessId = providedBusinessId || (req ? await resolveBusinessId(req) : '00000000-0000-0000-0000-000000000001');
    const business = await getBusinessConfig(businessId);

    const businessOverrides = {};
    if (business?.knowledge?.service_area) {
        businessOverrides.service_area_zips = business.knowledge.service_area.zip_codes || [];
    }

    // ─── Language Detection ──────────────────────────────────────────────────
    // Detect language from the latest user message. If the session already has
    // a detected language, use that (customer-initiated language persists).
    const lastUserMsg = [...currentMessages].reverse().find(m => m.role === 'user');
    const detectedLang = lastUserMsg ? detectLanguage(lastUserMsg.content) : 'en';

    // Load existing session language (if any) to persist it across turns
    sessionLanguage = detectedLang;
    if (supabaseAdmin && sessionId !== 'anonymous') {
        const { data: existingSession } = await supabaseAdmin
            .from('chat_sessions')
            .select('customer_data')
            .eq('session_id', sessionId)
            .maybeSingle();
        if (existingSession?.customer_data?.language) {
            sessionLanguage = existingSession.customer_data.language;
            // If customer switches language mid-conversation, respect the switch
            if (detectedLang !== sessionLanguage) {
                sessionLanguage = detectedLang;
            }
        }
    }

    businessOverrides.language = sessionLanguage;

    const systemPrompt = buildSystemPrompt(business || {}, businessOverrides);
    const currentDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    // PRUNING: Trim conversation to last N messages before sending to LLM.
    // This controls token cost — a 50-message conversation × 5 iterations = ~250K tokens
    // without pruning. With MAX_CONTEXT_MESSAGES=20, worst case is ~100K tokens.
    const prunedMessages = pruneConversationHistory(currentMessages);

    const apiMessages = [
        { role: 'system', content: `${systemPrompt}\n\n# CONTEXT\nToday is ${currentDate}. Use this to calculate relative dates like 'tomorrow' or 'next week'.\n\n# VISION\nIf the user sends vehicle photos, analyze them to assess condition, identify damage, and provide accurate quotes. Describe what you see in the photos.` },
        ...prunedMessages.map(m => {
            // Convert image_urls to OpenAI vision format
            if (m.image_urls && m.image_urls.length > 0) {
                const content = [];
                if (m.content) {
                    content.push({ type: 'text', text: m.content });
                }
                for (const url of m.image_urls) {
                    content.push({
                        type: 'image_url',
                        image_url: { url, detail: 'auto' },
                    });
                }
                return { role: m.role, content };
            }
            return { role: m.role, content: m.content };
        }),
    ];

    let bookingData = null;

    // Load existing booking data from session (including language preference)
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

    // Persist detected language in bookingData so it survives across turns
    if (!bookingData) bookingData = {};
    bookingData.language = sessionLanguage;

    // ─── Prompt Injection Guard ─────────────────────────────────────────────
    // Check ALL user messages for obvious injection patterns, not just the last.
    // An attacker could spread injection across multiple messages to evade a
    // single-message check. If ANY message is flagged, reject the entire turn.
    //
    // LIMITATION: This regex approach catches ONLY naive/obvious attempts.
    // Sophisticated attacks (paraphrased, encoded, multi-language) WILL bypass
    // this. It's a first-layer canary, not a complete defense.
    const userMessages = prunedMessages.filter(m => m.role === 'user');
    let detectedInjection = null;
    for (const msg of userMessages) {
        const injection = detectPromptInjection(msg.content);
        if (injection.detected) {
            detectedInjection = { ...injection, content: msg.content };
            break;
        }
    }
    if (detectedInjection) {
        log.warn('maestro', 'Prompt injection detected', {
            sessionId,
            requestId,
            source,
            pattern: detectedInjection.pattern,
            messagePreview: String(detectedInjection.content).slice(0, 100),
        });

        logEvent(sessionId, 'injection_attempt', {
            pattern: detectedInjection.pattern,
            message_preview: String(detectedInjection.content).slice(0, 200),
            source,
        }, requestId);

        const safeMsg = sessionLanguage === 'es'
            ? "Estoy aquí para ayudarle con servicios de detallado — precios, programación y evaluaciones de vehículos. ¿En qué puedo ayudarle hoy?"
            : "I'm here to help with detailing services — pricing, scheduling, and vehicle assessments. What can I help you with today?";

        return {
            role: 'assistant',
            content: safeMsg,
            bookingData,
            session_id: sessionId,
            language: sessionLanguage,
        };
    }

    // Model failover with circuit breaker
    const availableModels = [];
    if (hasGemini) availableModels.push({ name: 'gemini', model: 'gemini-2.0-flash', client: gemini });
    if (hasDeepSeek) availableModels.push({ name: 'deepseek', model: 'deepseek-chat', client: deepseek });
    if (hasOpenAI) availableModels.push({ name: 'openai', model: 'gpt-4o', client: openai });

    let iteration = 0;
    const maxIterations = 5;

    while (iteration < maxIterations) {
        log.info('maestro', 'Iteration started', { iteration: iteration + 1, maxIterations, source, requestId });

        let response = null;
        let lastError = null;
        for (const { name, model, client } of availableModels) {
            const breaker = getBreaker(name);
            if (!breaker.isAvailable()) {
                log.info('maestro', 'Model skipped (circuit breaker)', { model, requestId });
                continue;
            }

            try {
                response = await withAbortTimeout(
                    (signal) => client.chat.completions.create({
                        model,
                        messages: apiMessages,
                        tools: MAYA_TOOLS,
                        tool_choice: 'auto',
                        signal,
                    }),
                    DEFAULT_TIMEOUT_MS,
                    `AI ${model}`
                );
                breaker.recordSuccess();
                log.info('maestro', 'Model succeeded', { model, requestId });
                break;
            } catch (err) {
                lastError = err;
                breaker.recordFailure();
                log.warn('maestro', 'Model failed', { model, error: err.message, requestId });
            }
        }

        if (!response) {
            throw lastError || new Error('No AI models available');
        }

        const assistantMessage = response.choices[0].message;
        apiMessages.push(assistantMessage);

        if (!assistantMessage.tool_calls) {
            // Final response — persist session
            if (supabaseAdmin && sessionId !== 'anonymous') {
                await supabaseAdmin.from('chat_sessions').upsert({
                    session_id: sessionId,
                    customer_data: bookingData,
                    message_history: apiMessages.filter(m => m.role !== 'system'),
                    last_active: new Date().toISOString(),
                    source,
                    language: sessionLanguage,
                });
            }

            // Intentionally fire-and-forget; do not block response.
            // logEvent writes to usage_logs — acceptable to lose on function termination.
            logEvent(sessionId, 'chat_message', { content: assistantMessage.content, source, language: sessionLanguage }, requestId);

            return {
                role: 'assistant',
                content: assistantMessage.content,
                bookingData,
                session_id: sessionId,
                language: sessionLanguage,
            };
        }

        // Execute tools
        for (const toolCall of assistantMessage.tool_calls) {
            const name = toolCall.function.name;
            let result;

            try {
                const args = JSON.parse(toolCall.function.arguments);
                result = await executeTool(name, args, businessId);

                if (name === 'sync_booking_state') {
                    const parsedResult = JSON.parse(result);
                    if (parsedResult.status === 'synced' && parsedResult.data) {
                        bookingData = { ...bookingData, ...parsedResult.data };
                    }
                }

                logEvent(sessionId, 'tool_call', {
                    tool: name,
                    args: redactToolArgs(args),
                    result: redactToolArgs(result),
                    source,
                }, requestId);
            } catch (e) {
                log.error('maestro', 'Tool execution failed', { tool: name, error: e.message, requestId });
                result = JSON.stringify({ error: 'Failed to process tool request' });
            }

            apiMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: result,
            });
        }

        iteration++;
    }

    // Max iterations exceeded — persist partial data
    log.error('maestro', 'Max iterations exceeded', {
        sessionId,
        requestId,
        source,
        iterationCount: maxIterations,
    });

    if (supabaseAdmin && sessionId !== 'anonymous') {
        await supabaseAdmin.from('chat_sessions').upsert({
            session_id: sessionId,
            customer_data: bookingData,
            message_history: apiMessages.filter(m => m.role !== 'system'),
            last_active: new Date().toISOString(),
            source,
            language: sessionLanguage,
        });
    }

    const timeoutMsg = sessionLanguage === 'es'
        ? "Esta conversación está tomando más tiempo del esperado. Permítame que nuestro equipo le siga directamente para asegurar que todo esté perfecto."
        : "This conversation is taking longer than expected. Let me have our team follow up with you directly to make sure everything is perfect.";

    return {
        role: 'assistant',
        content: timeoutMsg,
        bookingData,
        session_id: sessionId,
        language: sessionLanguage,
        error: { code: 'MAX_ITERATIONS_EXCEEDED', request_id: requestId },
    };
}
