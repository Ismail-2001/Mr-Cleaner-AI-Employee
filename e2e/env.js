/**
 * E2E test environment helper.
 *
 * Reads .env.local so tests use the same credentials the server uses.
 * Next.js loads .env.local which overrides process.env, so we must
 * match those values — not hardcoded e2e-specific ones.
 */
import { readFileSync } from 'fs';

function loadEnvFile(path) {
    const vars = {};
    try {
        const content = readFileSync(path, 'utf8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
                vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
            }
        }
    } catch { /* file not found */ }
    return vars;
}

const localEnv = loadEnvFile('.env.local');

export const DASHBOARD_PASSWORD = localEnv.DASHBOARD_PASSWORD || process.env.DASHBOARD_PASSWORD || '';
export const ADMIN_API_SECRET = localEnv.ADMIN_API_SECRET || process.env.ADMIN_API_SECRET || '';
export const CRON_SECRET = localEnv.CRON_SECRET || process.env.CRON_SECRET || '';
