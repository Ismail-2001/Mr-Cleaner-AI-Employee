/**
 * Structured error reporting.
 *
 * WHY THIS EXISTS:
 * The codebase uses console.error everywhere, which means:
 * 1. Errors are unstructured — no severity, no context, no request ID
 * 2. No error tracking service integration (Sentry, Bugsnag)
 * 3. Server-side errors are lost on Vercel (console output is ephemeral)
 *
 * This module provides a lightweight reporter that:
 * - Logs structured error objects
 * - Is easily swappable for Sentry/Bugsnag when ready
 * - Never logs PII or secrets
 *
 * INTEGRATION: When ready to add Sentry:
 *   npm install @sentry/nextjs
 *   Then replace reportError with Sentry.captureException()
 */

const ERROR_LEVELS = {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    CRITICAL: 'critical',
};

/**
 * Report an error with structured context.
 * @param {Error|object} error - The error to report
 * @param {object} context - Additional context (requestId, userId, route, etc.)
 * @param {string} level - Error severity level
 */
export function reportError(error, context = {}, level = ERROR_LEVELS.ERROR) {
    const report = {
        level,
        message: error?.message || 'Unknown error',
        code: error?.code || error?.name || 'UNKNOWN',
        timestamp: new Date().toISOString(),
        ...context,
    };

    // Strip stack trace in production to avoid noise
    if (process.env.NODE_ENV !== 'production' && error?.stack) {
        report.stack = error.stack.split('\n').slice(0, 5).join('\n');
    }

    // Structured console output
    const prefix = `[${level.toUpperCase()}]`;
    if (level === ERROR_LEVELS.CRITICAL || level === ERROR_LEVELS.ERROR) {
        console.error(prefix, JSON.stringify(report));
    } else if (level === ERROR_LEVELS.WARN) {
        console.warn(prefix, JSON.stringify(report));
    } else {
        console.log(prefix, JSON.stringify(report));
    }

    // TODO: When Sentry is integrated, add:
    // Sentry.withScope(scope => {
    //     Object.entries(context).forEach(([key, val]) => scope.setExtra(key, val));
    //     scope.setLevel(level);
    //     Sentry.captureException(error);
    // });
}

/**
 * Report a non-fatal warning (e.g., degraded service, missing config).
 */
export function reportWarning(message, context = {}) {
    reportError(new Error(message), context, ERROR_LEVELS.WARN);
}

/**
 * Report a critical system error (e.g., database down, auth bypass attempt).
 */
export function reportCritical(message, context = {}) {
    reportError(new Error(message), context, ERROR_LEVELS.CRITICAL);
}

export { ERROR_LEVELS };
