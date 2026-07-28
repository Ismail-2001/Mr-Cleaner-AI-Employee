/**
 * Timeout utilities for external API calls.
 *
 * WHY THIS EXISTS:
 * All external API calls (Google Calendar, Gemini, OpenWeatherMap) can hang
 * indefinitely due to network issues, DNS failures, or upstream outages.
 * A hung request blocks the customer's chat message with no feedback.
 * These wrappers enforce a maximum wait time and provide clear fallback paths.
 */

export const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Wraps a Promise with a timeout that rejects after `ms` milliseconds.
 * The underlying operation is NOT cancelled (fire-and-forget on timeout),
 * but the caller gets a timely response so the chat doesn't hang.
 *
 * For cancellable operations, use `withAbortTimeout` instead.
 */
export function withTimeout(promise, ms = DEFAULT_TIMEOUT_MS, label = 'API call') {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        ),
    ]);
}

/**
 * Wraps a cancellable operation with a timeout using AbortController.
 * The underlying operation is actually cancelled when the timeout fires.
 *
 * @param {(signal: AbortSignal) => Promise} fn - Function that takes an AbortSignal
 * @param {number} ms - Timeout in milliseconds
 * @param {string} label - Label for error messages
 * @returns {Promise} - Result of the function, or rejects on timeout
 *
 * Usage:
 *   const data = await withAbortTimeout(
 *     (signal) => calendar.events.list({ calendarId: 'primary', ... }, { signal }),
 *     5000,
 *     'Calendar API'
 *   );
 */
export function withAbortTimeout(fn, ms = DEFAULT_TIMEOUT_MS, label = 'API call') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    return fn(controller.signal).finally(() => clearTimeout(timeout));
}

/**
 * Creates an AbortSignal that auto-aborts after `ms` milliseconds.
 * Use this with fetch() to actually cancel the HTTP request on timeout.
 */
export function abortAfter(ms = DEFAULT_TIMEOUT_MS) {
    return AbortSignal.timeout(ms);
}
