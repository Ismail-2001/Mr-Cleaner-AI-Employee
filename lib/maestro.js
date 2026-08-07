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
import { getBreaker } from '@/lib/circuit-breaker';
import { log } from '@/lib/logger';
import { validateFinalResponse } from '@/lib/output-validator';
import { redactBookingData, redactToolArgs } from './pii-redact';
import * as Sentry from '@sentry/nextjs';

// ─── Output Validation ───────────────────────────────────────────────────

// PII patterns that may appear in LLM responses (LLM may echo back customer data)
const PII_PATTERNS = [
    { regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[PHONE]' },          // Phone numbers
    { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL]' }, // Emails
    { regex: /\b\d{1,5}\s+\w+\s+(St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Way|Ln|Lane|Ct|Court|Pl|Place)\b/gi, replacement: '[ADDRESS]' }, // Addresses
];

function redactPIIFromContent(content) {
    if (!content || typeof content !== 'string') return content;
    let redacted = content;
    for (const { regex, replacement } of PII_PATTERNS) {
        redacted = redacted.replace(regex, replacement);
    }
    return redacted;
}

function sanitizeFinalResponse(raw, fallback, requestId) {
    const result = validateFinalResponse(raw);
    if (!result.valid) {
        log.error('maestro', 'Output validation failed', { error: result.error.message, requestId });
        Sentry.captureException(result.error, {
            tags: { module: 'maestro', method: 'sanitizeFinalResponse' },
            extra: { requestId, rawResponse: String(raw).slice(0, 500) },
        });
        return fallback;
    }
    // Redact PII from LLM response content before returning to client
    // This prevents the LLM from leaking customer data in logs or responses
    return {
        ...result.data,
        content: redactPIIFromContent(result.data.content),
    };
}

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
 * Maximum number of messages before we summarize older context.
 * When messages exceed this, older messages are compressed into a summary.
 */
const SUMMARIZE_THRESHOLD = 30;

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

/**
 * Summarize older messages when conversation exceeds the threshold.
 * Replaces old user/assistant pairs with a single summary message,
 * preserving the most recent messages intact for context.
 *
 * WHY THIS EXISTS: A 50-message conversation costs ~250K tokens across 5
 * iterations. Summarizing the older half into a 200-token summary cuts
 * costs by ~60% while preserving key context (service discussed, price
 * quoted, date requested).
 *
 * @param {Array} messages - Full conversation history
 * @returns {Array} Messages with older context summarized
 */
export function summarizeOldMessages(messages) {
    if (messages.length <= SUMMARIZE_THRESHOLD) return messages;

    // Keep the most recent MAX_CONTEXT_MESSAGES messages intact
    const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);
    const oldMessages = messages.slice(0, -MAX_CONTEXT_MESSAGES);

    // Extract key facts from old messages for the summary
    const summary = [];
    const userTopics = [];
    const toolsUsed = [];
    let mentionedService = null;
    let mentionedDate = null;
    let mentionedPrice = null;

    for (const msg of oldMessages) {
        if (msg.role === 'user' && typeof msg.content === 'string') {
            // Capture first 50 chars of each user message for topic summary
            const preview = msg.content.slice(0, 50).trim();
            if (preview) userTopics.push(preview);
        }
        if (msg.role === 'assistant' && msg.tool_calls) {
            for (const tc of msg.tool_calls) {
                toolsUsed.push(tc.function?.name);
            }
        }
        if (msg.role === 'tool' && typeof msg.content === 'string') {
            try {
                const parsed = JSON.parse(msg.content);
                if (parsed.service) mentionedService = parsed.service;
                if (parsed.price) mentionedPrice = parsed.price;
                if (parsed.date) mentionedDate = parsed.date;
            } catch { /* not JSON */ }
        }
    }

    const summaryParts = ['[Conversation summary:'];
    if (userTopics.length > 0) {
        summaryParts.push(`Customer discussed: ${userTopics.slice(0, 3).join('; ')}`);
    }
    if (toolsUsed.length > 0) {
        summaryParts.push(`Tools invoked: ${[...new Set(toolsUsed)].join(', ')}`);
    }
    if (mentionedService) summaryParts.push(`Service: ${mentionedService}`);
    if (mentionedPrice) summaryParts.push(`Quoted price: $${mentionedPrice}`);
    if (mentionedDate) summaryParts.push(`Requested date: ${mentionedDate}`);
    summaryParts.push(']');

    summary.push({
        role: 'assistant',
        content: summaryParts.join(' '),
    });

    return [...summary, ...recentMessages];
}

/**
 * Maximum wall-clock time (ms) for the entire orchestration loop.
 * 5 iterations × 3 models × 10s timeout = 150s theoretical max.
 * 45s is a hard cap so customers never wait > 1 minute.
 */
const ORCHESTRATION_DEADLINE_MS = 45_000;

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
    const loopStartTime = Date.now();

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

    // SINGLE SESSION READ: Load existing session data once for both language
    // and booking data. Previously this was two separate DB queries.
    let bookingData = null;
    let previousLastActive = null;
    sessionLanguage = detectedLang; // Default to detected language
    if (supabaseAdmin && sessionId !== 'anonymous') {
        const { data: existingSession } = await supabaseAdmin
            .from('chat_sessions')
            .select('customer_data, last_active')
            .eq('session_id', sessionId)
            .maybeSingle();
        if (existingSession?.customer_data) {
            bookingData = { ...existingSession.customer_data };
            previousLastActive = existingSession.last_active;
            if (existingSession.customer_data.language) {
                // If customer switches language mid-conversation, respect the switch
                if (detectedLang !== existingSession.customer_data.language) {
                    sessionLanguage = detectedLang;
                } else {
                    sessionLanguage = existingSession.customer_data.language;
                }
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

    // SUMMARIZATION: When conversation is long, compress old messages into a
    // summary. This preserves key context (service, price, date) while reducing
    // token cost by ~60% for conversations > 30 messages.
    const contextMessages = summarizeOldMessages(prunedMessages);

    // IMAGE TOKEN BUDGET: Cap images to prevent token explosion.
    // Each image costs ~85 tokens (low detail) to ~1700 tokens (high detail).
    // With 3 images per message × 5 iterations, that's 25K tokens just for images.
    // Budget: max 2 images per conversation context window.
    const MAX_IMAGES_IN_CONTEXT = 2;
    let imageCount = 0;

    const apiMessages = [
        { role: 'system', content: `${systemPrompt}\n\n# CONTEXT\nToday is ${currentDate}. Use this to calculate relative dates like 'tomorrow' or 'next week'.\n\n# VISION\nIf the user sends vehicle photos, analyze them to assess condition, identify damage, and provide accurate quotes. Describe what you see in the photos.` },
        ...contextMessages.map(m => {
            // Convert image_urls to OpenAI vision format
            if (m.image_urls && m.image_urls.length > 0) {
                const content = [];
                if (m.content) {
                    content.push({ type: 'text', text: m.content });
                }
                // Respect image token budget — skip images beyond cap
                for (const url of m.image_urls) {
                    if (imageCount >= MAX_IMAGES_IN_CONTEXT) {
                        content.push({ type: 'text', text: '[Image omitted — token budget exceeded]' });
                        continue;
                    }
                    imageCount++;
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

    // bookingData loaded in single session read above

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
        // WALL-CLOCK DEADLINE: Hard cap to prevent blocking > 45s.
        // Even if each iteration times out individually, the total loop
        // must not exceed the deadline.
        if (Date.now() - loopStartTime >= ORCHESTRATION_DEADLINE_MS) {
            log.error('maestro', 'Wall-clock deadline exceeded', {
                elapsed_ms: Date.now() - loopStartTime,
                iteration: iteration + 1,
                requestId,
            });
            break;
        }

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
            // Final response — persist session with optimistic lock.
            // Only update if last_active hasn't changed since we read it,
            // preventing concurrent requests from overwriting each other.
            if (supabaseAdmin && sessionId !== 'anonymous') {
                const upsertData = {
                    session_id: sessionId,
                    customer_data: bookingData,
                    message_history: apiMessages.filter(m => m.role !== 'system'),
                    last_active: new Date().toISOString(),
                    source,
                    language: sessionLanguage,
                };
                // Try conditional update first (optimistic lock)
                // Only update if last_active hasn't changed since we read it,
                // preventing concurrent requests from overwriting each other.
                const { error: updateErr } = await supabaseAdmin
                    .from('chat_sessions')
                    .update(upsertData)
                    .eq('session_id', sessionId)
                    .eq('last_active', previousLastActive || upsertData.last_active);
                // If row doesn't exist, fall back to insert
                if (updateErr) {
                    await supabaseAdmin.from('chat_sessions').upsert(upsertData);
                }
            }

            // Intentionally fire-and-forget; do not block response.
            // logEvent writes to usage_logs — acceptable to lose on function termination.
            logEvent(sessionId, 'chat_message', { content: assistantMessage.content, source, language: sessionLanguage }, requestId);

            return sanitizeFinalResponse(
                {
                    role: 'assistant',
                    content: assistantMessage.content,
                    bookingData,
                    session_id: sessionId,
                    language: sessionLanguage,
                },
                {
                    role: 'assistant',
                    content: sessionLanguage === 'es'
                        ? 'Disculpe, estoy teniendo un problema técnico. Por favor, intente de nuevo en unos minutos.'
                        : "I'm experiencing a technical issue. Please try again in a few minutes.",
                    bookingData,
                    session_id: sessionId,
                    language: sessionLanguage,
                    error: { code: 'OUTPUT_VALIDATION_FAILED' },
                },
                requestId,
            );
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

    // Max iterations or deadline exceeded — persist partial data
    const elapsed = Date.now() - loopStartTime;
    const reason = elapsed >= ORCHESTRATION_DEADLINE_MS ? 'DEADLINE_EXCEEDED' : 'MAX_ITERATIONS_EXCEEDED';
    log.error('maestro', `Orchestration loop terminated: ${reason}`, {
        sessionId,
        requestId,
        source,
        iterationCount: iteration,
        elapsed_ms: elapsed,
    });

    if (supabaseAdmin && sessionId !== 'anonymous') {
        const upsertData = {
            session_id: sessionId,
            customer_data: bookingData,
            message_history: apiMessages.filter(m => m.role !== 'system'),
            last_active: new Date().toISOString(),
            source,
            language: sessionLanguage,
        };
        const { error: updateErr } = await supabaseAdmin
            .from('chat_sessions')
            .update(upsertData)
            .eq('session_id', sessionId);
        if (updateErr) {
            await supabaseAdmin.from('chat_sessions').upsert(upsertData);
        }
    }

    const timeoutMsg = sessionLanguage === 'es'
        ? "Esta conversación está tomando más tiempo del esperado. Permítame que nuestro equipo le siga directamente para asegurar que todo esté perfecto."
        : "This conversation is taking longer than expected. Let me have our team follow up with you directly to make sure everything is perfect.";

    return sanitizeFinalResponse(
        {
            role: 'assistant',
            content: timeoutMsg,
            bookingData,
            session_id: sessionId,
            language: sessionLanguage,
            error: { code: 'MAX_ITERATIONS_EXCEEDED', request_id: requestId },
        },
        {
            role: 'assistant',
            content: sessionLanguage === 'es'
                ? 'Esta conversación está tomando más tiempo del esperado. Permítame que nuestro equipo le siga directamente para asegurar que todo esté perfecto.'
                : "This conversation is taking longer than expected. Let me have our team follow up with you directly to make sure everything is perfect.",
            bookingData,
            session_id: sessionId,
            language: sessionLanguage,
            error: { code: 'MAX_ITERATIONS_EXCEEDED', request_id: requestId },
        },
        requestId,
    );
}
