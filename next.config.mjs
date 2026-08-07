import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Compression: enabled by default in Next.js production builds.
    // Explicitly set for clarity — gzip/brotli reduces response size 60-80%.
    compress: true,

    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'images.unsplash.com' },
        ],
        // For production: download images to public/images/ and remove remotePatterns
    },
    headers: async () => [
        {
            source: '/(.*)',
            headers: [
                { key: 'X-Frame-Options', value: 'DENY' },
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
                {
                    key: 'Content-Security-Policy',
                    // NOTE: 'unsafe-eval' and 'unsafe-inline' are required by Next.js
                    // for hydration scripts and RSC. To remove them, implement nonce-based
                    // CSP using next/script with nonce prop. See: https://nextjs.org/docs/app/building-your-application/security/content-security-policy
                    value: [
                        "default-src 'self'",
                        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
                        "style-src 'self' 'unsafe-inline'",
                        "img-src 'self' data: blob:",
                        "font-src 'self'",
                        "connect-src 'self' https://euuwlluercgopstyyllf.supabase.co https://generativelanguage.googleapis.com wss://euuwlluercgopstyyllf.supabase.co",
                        "frame-ancestors 'none'",
                    ].join('; '),
                },
            ],
        },
        // Static assets: long cache (Next.js hashes filenames for cache-busting)
        {
            source: '/_next/static/(.*)',
            headers: [
                { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
            ],
        },
        // Public static files: long cache
        {
            source: '/images/(.*)',
            headers: [
                { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
            ],
        },
        // Health check: no cache (always fresh)
        {
            source: '/api/health',
            headers: [
                { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
            ],
        },
        // Read-only availability check: short cache (1 min)
        {
            source: '/api/bookings\\?date=(.*)',
            headers: [
                { key: 'Cache-Control', value: 'public, max-age=60, stale-while-revalidate=120' },
            ],
        },
    ],
};

export default withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
});
