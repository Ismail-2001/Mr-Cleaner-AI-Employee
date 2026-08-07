import { defineConfig } from '@playwright/test';
import { readFileSync } from 'fs';

/**
 * Playwright E2E configuration.
 *
 * WHY API-LEVEL TESTS (not browser):
 * This project is an API backend with a thin React frontend. The critical
 * paths are: auth, chat, bookings, webhooks. Browser-based E2E would be
 * flaky (rendering timing), slow (full page loads), and wouldn't catch
 * API contract bugs. API-level E2E tests are deterministic, fast, and
 * catch real integration issues between middleware → route → DB → external APIs.
 *
 * WEBSERVER: Playwright starts `next start` on a random port before tests.
 * The server is built in CI (npm run build) before Playwright runs.
 *
 * ENV STRATEGY: NODE_ENV=test so Next.js skips .env.local loading.
 * This lets Playwright's webServer.env values take effect.
 * Critical vars (Supabase, ADMIN_API_SECRET) are read from .env.local
 * and forwarded to the server process.
 */
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
    } catch { /* file not found — use process.env fallback */ }
    return vars;
}

const localEnv = loadEnvFile('.env.local');

export default defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    expect: { timeout: 5_000 },
    fullyParallel: false, // Sequential — tests share the server state
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: process.env.CI ? 'github' : 'list',

    use: {
        baseURL: 'http://localhost:3000',
        extraHTTPHeaders: {
            'Accept': 'application/json',
        },
    },

    webServer: {
        command: 'npm run start',
        port: 3000,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: {
            NODE_ENV: 'test',
            DASHBOARD_PASSWORD: 'e2e-test-password-12345',
            DASHBOARD_SESSION_SECRET: 'e2e-test-secret-for-playwright-tests-32ch!',
            ADMIN_API_SECRET: localEnv.ADMIN_API_SECRET || 'e2e-admin-secret',
            CRON_SECRET: localEnv.CRON_SECRET || 'e2e-cron-secret',
            NEXT_PUBLIC_SUPABASE_URL: localEnv.NEXT_PUBLIC_SUPABASE_URL || '',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
            SUPABASE_SERVICE_ROLE_KEY: localEnv.SUPABASE_SERVICE_ROLE_KEY || '',
        },
    },

    projects: [
        {
            name: 'e2e',
            testMatch: '**/*.spec.js',
        },
    ],
});
