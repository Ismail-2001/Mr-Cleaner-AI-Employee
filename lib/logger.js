/**
 * Structured logging module.
 *
 * WHY THIS EXISTS:
 * The codebase has ~50 console.log/warn/error calls with inconsistent formats.
 * Some are JSON, some are plain strings, some include request IDs, some don't.
 * This module provides a single `log()` function that outputs structured JSON
 * with consistent fields, making logs pipeable into Datadog, Logtail, or any
 * log aggregator.
 *
 * FORMAT:
 * All logs are JSON with: { level, module, message, ...extra, timestamp }
 *
 * USAGE:
 * import { log } from '@/lib/logger';
 * log.info('chat', 'Model succeeded', { model: 'gemini', requestId: 'abc' });
 * log.warn('rate-limit', 'Redis unavailable', { limiter: 'chat' });
 * log.error('webhook', 'Parse failed', { error: err.message, statusCode: 500 });
 */

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const minLevel = LEVELS[LOG_LEVEL] ?? 1;

function emit(level, module, message, extra = {}) {
    if (LEVELS[level] < minLevel) return;

    const entry = {
        level,
        module,
        message,
        ...extra,
        timestamp: new Date().toISOString(),
    };

    const line = JSON.stringify(entry);

    if (level === 'error') {
        console.error(line);
    } else if (level === 'warn') {
        console.warn(line);
    } else {
        console.log(line);
    }
}

export const log = {
    debug: (module, message, extra) => emit('debug', module, message, extra),
    info: (module, message, extra) => emit('info', module, message, extra),
    warn: (module, message, extra) => emit('warn', module, message, extra),
    error: (module, message, extra) => emit('error', module, message, extra),
};

/**
 * Create a child logger pre-bound to a module name.
 * Useful for modules that always log with the same module tag.
 *
 * @param {string} moduleName
 * @returns {Object} { debug, info, warn, error }
 */
export function createLogger(moduleName) {
    return {
        debug: (message, extra) => log.debug(moduleName, message, extra),
        info: (message, extra) => log.info(moduleName, message, extra),
        warn: (message, extra) => log.warn(moduleName, message, extra),
        error: (message, extra) => log.error(moduleName, message, extra),
    };
}
