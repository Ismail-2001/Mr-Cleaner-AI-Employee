/**
 * Environment variable type coercion helpers.
 *
 * WHY THIS EXISTS:
 * Process.env vars are always strings. Boolean checks like
 * `process.env.USE_REDIS !== 'false'` are correct but error-prone.
 * These helpers make intent explicit and handle edge cases.
 */

/**
 * Read a boolean env var. Truthy values: 'true', '1', 'yes'.
 * Falsy values: 'false', '0', 'no', ''.
 * Undefined/null returns the default.
 *
 * @param {string} name - Env var name
 * @param {boolean} defaultValue - Fallback if unset
 * @returns {boolean}
 */
export function envBool(name, defaultValue = false) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || raw === '') return defaultValue;
    return ['true', '1', 'yes'].includes(raw.toLowerCase().trim());
}

/**
 * Read a numeric env var. Returns defaultValue if not a valid number.
 *
 * @param {string} name - Env var name
 * @param {number} defaultValue - Fallback if unset or invalid
 * @returns {number}
 */
export function envInt(name, defaultValue = 0) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || raw === '') return defaultValue;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? defaultValue : n;
}
