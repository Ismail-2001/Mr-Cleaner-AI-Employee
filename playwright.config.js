import { defineConfig } from '@playwright/test';

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
 */
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
            NODE_ENV: 'production',
            DASHBOARD_PASSWORD: 'e2e-test-password-12345',
            DASHBOARD_SESSION_SECRET: 'e2e-test-secret-for-playwright-tests-32ch!',
        },
    },

    projects: [
        {
            name: 'e2e',
            testMatch: '**/*.spec.js',
        },
    ],
});
