import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
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
    ],
};

export default withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
});
