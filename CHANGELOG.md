# Changelog

## 2026-07-24 — Audit Fixes & Payment Migration

### Security
- **PII encryption at rest**: Phone, address, and customer_name encrypted with AES-256-GCM before DB insert; decrypted on read. Fail-closed if `ENCRYPTION_KEY` missing. (`lib/encrypt.js`, `lib/supabase.js`)
- **In-memory rate limiting removed**: All rate limiters use Redis exclusively. No false-security Map fallback. When Redis is unavailable, request is allowed with Sentry warning. (`lib/rate-limit.js`)
- **In-memory slot lock removed**: Booking race prevention is Redis-only; DB unique constraint is the hard backstop. (`app/api/bookings/route.js`)

### Fixes
- **Cache parse hazard**: `getKnowledge()` wrapped in try/catch for malformed Redis data. (`lib/tools.js:54`)
- **Unsplash URL fix**: Malformed image URL (`com-150713...`) corrected to local `public/images/` assets. (`app/page.js`)
- **Health check**: Now returns 503 on unhealthy dependencies; includes PII encryption status. (`app/api/health/route.js`)
- **Build tooling**: `tsconfig.json` added for TypeScript migration path; `db:migrate` script added to `package.json`.

### Payment Migration
- **LemonSqueezy integration**: New `lib/lemon-squeezy.js` with checkout creation, order retrieval, refund, and webhook verification.
- **Dual-provider refund**: `lib/refund.js` detects payment provider from booking notes and routes to the correct API.
- **Setup wizard updated**: `app/setup/page.js` now guides through LemonSqueezy as primary payment option.
- **Tests**: 209/209 passing across 17 suites.
