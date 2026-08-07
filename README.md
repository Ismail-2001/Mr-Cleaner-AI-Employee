<div align="center">

# Maya — AI Booking Agent for Mobile Detailing

### Turn website visitors into confirmed, paid bookings — without hiring a single person

![Version](https://img.shields.io/badge/version-0.1.0-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Tests](https://img.shields.io/badge/tests-243%20passing-brightgreen?style=flat-square)
![Node](https://img.shields.io/badge/node-20.x-339933?style=flat-square&logo=node.js&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js&logoColor=white)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Mr-Cleaner-AI-Employee/Mr-Cleaner-AI-Employee)

**Stop losing customers to slow responses. Let Maya book while you work.**

</div>

---

## Why This Exists

You're a busy mobile detailer. A potential customer visits your website at 9 PM on a Tuesday. They want to book a ceramic coating for their BMW X5 next Saturday. But you're elbow-deep in a correction job, your phone is in the shop, and by the time you see the message at 6 AM Wednesday — they've already booked with your competitor.

**This costs you $400–$800 per lost booking. That's $4,000–$8,000 per month in missed revenue.**

**Maya** is a 24/7 AI concierge that works like a full-time receptionist, dispatcher, and sales team — but costs nothing monthly and never sleeps.

---

## Architecture Overview

```
Customer Channels          API Layer              Core Engine              External Services       Data Layer
─────────────────          ─────────              ───────────              ─────────────────       ──────────
Web Chat Widget      ──►   /api/chat         ──►  Maya Orchestration  ──►  Google Calendar     ──►  Supabase PostgreSQL
Meta Messenger       ──►   /api/webhook/meta ──►  Engine (maestro.js) ──►  LemonSqueezy        ──►  Upstash Redis
Instagram DMs        ──►   /api/webhook/meta ──►       │               ──►  Stripe (fallback)       (optional)
Google Business      ──►   /api/webhook/google──►       │               ──►  Twilio SMS
SMS via Twilio       ──►   /api/cron/*       ──►       ▼               ──►  Resend Email
                                                AI Model Router
                                                (Gemini → DeepSeek → OpenAI)
```

**Key architectural decisions:**
- **Orchestration engine** (`lib/maestro.js`) — single entry point shared across all channels (web, Messenger, Instagram)
- **Tool-calling loop** — AI decides which tools to call, results feed back until the AI has enough to respond
- **Circuit breaker** (`lib/circuit-breaker.js`) — tracks consecutive failures per AI model; trips to OPEN after 3 failures, 60s cooldown
- **Multi-tenant by default** — every query scoped by `business_id`; zero cross-tenant data leaks

---

## Features

### Booking Intelligence
- **Service area verification** — checks zip codes before proceeding
- **Dynamic pricing** — adjusts for vehicle type, condition, and add-ons
- **Calendar sync** — real-time Google Calendar integration, no double-bookings
- **Deposit collection** — LemonSqueezy (primary) or Stripe checkout, pre-collected
- **Weather awareness** — warns about outdoor appointments, suggests alternatives

### Multi-Channel Presence
- **Web chat widget** — embed on any website
- **Meta Messenger** — Facebook Page integration
- **Instagram DMs** — automated responses to DMs
- **Google Business Profile** — review replies and auto-responses
- **SMS via Twilio** — lead alerts and customer confirmations

### Bilingual Support (English & Spanish)
- Automatic detection from first message
- Professional US Hispanic register
- Auto-detailing terminology translations
- Seamless language switching mid-conversation

### Enterprise Security
- **Rate limiting** — per-session + per-IP (Redis with in-memory fallback)
- **Prompt injection guard** — first-layer canary detection on all user messages
- **PII encryption** — AES-256-GCM at rest for customer data
- **PII redaction** — customer data stripped from all logs
- **HMAC webhook verification** — Meta, Stripe, LemonSqueezy, Google
- **Circuit breaker** — prevents cascade failures across AI providers
- **JWT sessions** — server-side revocation, 8-hour lifetime

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Runtime** | Node.js 20.x | LTS, native ESM, serverless-optimized |
| **Framework** | Next.js 16 (App Router) | Server components, API routes, zero-config deploy |
| **Frontend** | React 19 + CSS Modules | Zero-runtime, dark mode, Framer Motion animations |
| **AI Engine** | Gemini 2.0 Flash (primary) | Fast, free tier, 15 RPM |
| **AI Fallback** | DeepSeek → OpenAI | Graceful degradation on failure |
| **Database** | Supabase (PostgreSQL) | Managed, real-time, free tier |
| **Cache** | Upstash Redis (optional) | Serverless rate limiting, circuit breaker state |
| **Payments** | LemonSqueezy (primary) | Pakistan-compatible, webhook-verified |
| **Payments (fallback)** | Stripe | Industry-standard, deposit collection |
| **Calendar** | Google Calendar API | Real-time sync, no double-bookings |
| **SMS** | Twilio (3-retry + fallback) | Reliable delivery, TCPA-compliant |
| **Email** | Resend | Clean templates, free 100/day |
| **Auth** | JWT (jose) | Stateless, server-side revocation |
| **Monitoring** | Sentry + structured JSON logs | Error tracking, request tracing |
| **Validation** | Zod schemas | Type-safe input validation at every boundary |
| **Testing** | Vitest (unit) + Playwright (E2E) | 243 unit tests + 30 E2E tests |
| **Deployment** | Vercel (zero-config) | Auto-deploy on push, edge functions |

---

## Quick Start

### Prerequisites

- Node.js 20.x
- A Supabase account (free tier works)
- A Gemini API key (free tier: 15 requests/min)

### 1. Clone & Install

```bash
git clone https://github.com/Mr-Cleaner-AI-Employee/Mr-Cleaner-AI-Employee.git
cd Mr-Cleaner-AI-Employee
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` — **minimum required variables**:

```env
# Core (all required)
DASHBOARD_PASSWORD=your_password
DASHBOARD_SESSION_SECRET=your_session_secret_64_chars
ADMIN_API_SECRET=your_admin_secret_64_chars
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx

# Payment — LemonSqueezy (primary, Pakistan-compatible)
LEMONSQUEEZY_API_KEY=your_ls_key
LEMONSQUEEZY_STORE_ID=your_store_id
LEMONSQUEEZY_VARIANT_ID=your_variant_id
LEMONSQUEEZY_WEBHOOK_SECRET=your_webhook_secret

# AI (at least one required)
GEMINI_API_KEY=your_gemini_key

# Business
BUSINESS_NAME=Your Business Name
BUSINESS_PHONE=+1XXXXXXXXXX
BUSINESS_EMAIL=you@business.com
BUSINESS_LOCATION=City, State
BUSINESS_TIMEZONE=America/Chicago
```

See [`.env.example`](.env.example) for the full list (40+ variables). Optional features gracefully disable when their env vars are missing.

### 3. Initialize Database

Run in your Supabase SQL Editor (in order):

```sql
-- 1. Base schema
\i supabase/schema.sql

-- 2. Multi-tenancy
\i supabase/multi-tenancy-migration.sql

-- 3. Vehicle photos
\i supabase/vehicle-photos-migration.sql

-- 4. WhatsApp integration
\i supabase/0004_whatsapp_integration.sql

-- 5. Loyalty program
\i supabase/0005_loyalty_program.sql
```

Or use the migration runner:

```bash
npm run db:migrate
```

### 4. Start Development

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) — Maya is live.

### 5. Deploy to Vercel

```bash
npx vercel --prod
```

Or connect your GitHub repo to Vercel for auto-deploys on every push.

---

## Project Structure

```
├── app/                              Next.js App Router
│   ├── api/
│   │   ├── chat/                     Maya chat endpoint (main entry point)
│   │   ├── bookings/                 Booking CRUD
│   │   ├── calendar/                 Calendar availability
│   │   ├── stripe/                   Stripe payment processing
│   │   ├── lemon-squeezy/            LemonSqueezy webhook handler
│   │   ├── dashboard/                Owner dashboard + analytics
│   │   ├── cron/                     Scheduled tasks (daily summary)
│   │   ├── integrations/             Jobber, third-party
│   │   ├── webhook/                  Meta, Google webhooks
│   │   ├── health/                   System health check
│   │   └── upload/                   Photo uploads
│   ├── booking/                      Customer-facing booking pages
│   ├── dashboard/                    Owner dashboard UI
│   ├── setup/                        Onboarding wizard
│   └── page.js                       Landing page
│
├── lib/                              Core business logic
│   ├── maestro.js                    Maya orchestration engine (shared across channels)
│   ├── ai-agent.js                   System prompt + LOCALES registry
│   ├── tools.js                      14 tool functions (quote, calendar, loyalty, etc.)
│   ├── output-validator.js           LLM response validation (Zod schema)
│   ├── logger.js                     Structured JSON logger with child loggers
│   ├── circuit-breaker.js            AI model circuit breaker (CLOSED/OPEN/HALF-OPEN)
│   ├── calendar.js                   Google Calendar integration
│   ├── stripe.js                     Stripe payment processing (fallback)
│   ├── lemon-squeezy.js              LemonSqueezy API client (primary)
│   ├── twilio.js                     SMS with 3-retry + fallback
│   ├── email.js                      Bilingual email templates
│   ├── meta.js                       Meta Messenger + Instagram + WhatsApp
│   ├── gbp.js                        Google Business Profile
│   ├── jobber.js                     Jobber CRM integration
│   ├── redis.js                      Shared Redis client (lazy-init, optional)
│   ├── rate-limit.js                 Multi-tier rate limiting (Redis + in-memory fallback)
│   ├── session.js                    JWT session management
│   ├── tenant.js                     Multi-tenant business resolution
│   ├── supabase.js                   Database operations (paginated, encrypted PII)
│   ├── supabase-admin.js             Singleton Supabase client
│   ├── photo-upload.js               Vehicle photo processing
│   ├── refund.js                     Dual-provider refund logic (LemonSqueezy + Stripe)
│   ├── pii-redact.js                 PII scrubbing for logs
│   ├── pii-encrypt.js                AES-256-GCM encryption for PII at rest
│   ├── business-config.js            Multi-tenant landing page config loader
│   ├── env-helpers.js                envBool() / envInt() type coercion
│   ├── csrf.js                       CSRF token generation
│   ├── validate-env.js               Startup env validation (production fail-closed)
│   └── validate-request.js           Zod request validation
│
├── components/                       React components
│   ├── ChatInterface.js              AI chat widget
│   ├── ChatButton.js                 Floating action button
│   ├── Hero.js                       Animated hero section
│   ├── ServiceMenu.js                Service cards + modals
│   ├── Testimonials.js               Social proof section
│   ├── StatsCounter.js               Animated statistics
│   ├── BeforeAfterSlider.js          Image comparison
│   ├── Navbar.js                     Scroll-aware navigation
│   └── dashboard/                    Dashboard components
│
├── tests/                            243 unit/integration tests
│   ├── maestro.test.js               Orchestration engine (24 tests)
│   ├── tools.test.js                 Tool execution (30 tests)
│   ├── tenant.test.js                Multi-tenant isolation (9 tests)
│   ├── rate-limit.test.js            Rate limiting (17 tests)
│   ├── i18n.test.js                  Bilingual support (15 tests)
│   ├── output-validator.test.js      LLM output validation (12 tests)
│   ├── csrf.test.js                  CSRF protection (13 tests)
│   ├── circuit-breaker.test.js       Circuit breaker (9 tests)
│   ├── meta-webhook.test.js          Meta webhook verification (16 tests)
│   ├── photo-upload.test.js          Photo upload + analysis (15 tests)
│   ├── twilio.test.js                SMS retry logic (11 tests)
│   ├── refund.test.js                Refund processing (10 tests)
│   ├── session.test.js               JWT session management (7 tests)
│   ├── booking-concurrency.test.js   Booking race conditions (2 tests)
│   ├── runtime-resilience.test.js    Edge cases (4 tests)
│   ├── webhook-revenue.test.js       Webhook revenue integrity (4 tests)
│   ├── env-validation.test.js        Environment validation (5 tests)
│   └── integration-real.test.js      Live Supabase (gated by INTEGRATION_TESTS=true)
│
├── e2e/                              30 Playwright E2E tests (API-level)
│   ├── chat.spec.js                  Chat API contract tests
│   ├── auth.spec.js                  Dashboard authentication
│   ├── bookings.spec.js              Booking CRUD operations
│   ├── health.spec.js                Health check + verbose endpoint
│   └── security.spec.js              Rate limiting, CSRF, headers
│
├── supabase/                         Database schemas + migrations
│   ├── schema.sql                    Base schema
│   ├── multi-tenancy-migration.sql   Business isolation
│   ├── vehicle-photos-migration.sql  Photo storage
│   ├── 0004_whatsapp_integration.sql
│   └── 0005_loyalty_program.sql
│
├── scripts/                          Utility scripts
│   └── migrate.js                    Database migration runner
│
├── playwright.config.js              E2E test configuration
├── vitest.config.js                  Unit test configuration
├── middleware.js                      Next.js middleware (CSRF, security headers)
├── sentry.client.config.js           Sentry client setup
├── sentry.server.config.js           Sentry server setup
├── DEPLOY.md                         Production deployment checklist
├── STAGING.md                        Staging environment setup
├── ARCHITECTURE.md                   Architecture decision records
├── AUDIT.md                          Security audit log
├── SECURITY_CHANGELOG.md             Vulnerability fix history
└── CHANGELOG.md                      Release notes
```

---

## API Reference

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | Maya chat — main entry point |
| `POST` | `/api/v1/chat` | Maya chat — versioned route |

### Bookings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/bookings` | Create booking |
| `GET` | `/api/bookings` | List bookings (authenticated) |
| `POST` | `/api/v1/bookings` | Create booking — versioned |
| `GET` | `/api/v1/bookings` | List bookings — versioned |

### Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/stripe/webhook` | Stripe payment events |
| `POST` | `/api/lemon-squeezy/webhook` | LemonSqueezy payment events |

### Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/dashboard/auth` | Dashboard login |
| `GET` | `/api/dashboard/analytics` | Analytics with week-over-week trends |
| `GET` | `/api/dashboard/analytics/export` | CSV export |
| `POST` | `/api/dashboard/refund` | Process refund (dual-provider) |
| `PUT` | `/api/dashboard/settings` | Update business settings |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/webhook/meta` | Meta Messenger webhook |
| `GET` | `/api/webhook/meta` | Meta verification |
| `POST` | `/api/webhook/google` | Google Business webhook |

### Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | System health check |
| `POST` | `/api/health` | Verbose health (CRON_SECRET required) |
| `GET` | `/api/v1/health` | Health check — versioned |
| `POST` | `/api/cron/daily-summary` | Daily owner summary |
| `POST` | `/api/admin/rate-limit/reset` | Reset rate limits (ADMIN_API_SECRET required) |
| `POST` | `/api/upload` | Vehicle photo upload |

---

## Testing

### Unit & Integration Tests (Vitest)

```bash
npm test                    # Run all 243 tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

**Test coverage by module:**

| Module | Tests | What's Covered |
|--------|-------|----------------|
| Tool execution | 30 | All 14 tools, edge cases, validation |
| Orchestration | 24 | Prompt injection, language detection, session persistence |
| Rate limiting | 17 | Per-session, per-IP, Redis + in-memory fallback |
| Meta webhooks | 16 | Signature verification, message routing, button handling |
| Photo upload | 15 | Magic byte detection, signed URLs, tool acknowledgment |
| Internationalization | 15 | Spanish detection, locale registry, bilingual responses |
| CSRF | 13 | Token generation, validation, timing-safe comparison |
| Output validation | 12 | LLM response schema, tool result validation |
| Error reporting | 12 | Sentry integration, structured logging |
| Integrations | 11 | Jobber, GBP, third-party APIs |
| Twilio SMS | 11 | Retry logic, fallback, delivery confirmation |
| Refunds | 10 | Dual-provider (LemonSqueezy + Stripe), idempotency |
| Tenant isolation | 9 | Business-scoped queries, cross-tenant leak prevention |
| Circuit breaker | 9 | CLOSED/OPEN/HALF-OPEN states, Redis persistence |
| Sessions | 7 | JWT creation, validation, revocation |
| Booking concurrency | 2 | Race conditions, slot conflict detection |
| Runtime resilience | 4 | Null clients, malformed cache, graceful degradation |
| Webhook revenue | 4 | Payment verification, deposit integrity |
| Environment | 5 | Required vars, fail-closed, type coercion |

### E2E Tests (Playwright)

```bash
npm run test:e2e            # Run E2E against local server
npm run test:e2e:ui         # Interactive UI mode
```

**30 API-level E2E tests** covering:
- Chat API — request validation, session management, streaming
- Auth — login, session cookies, protected routes
- Bookings — CRUD, validation, availability
- Health — status, verbose endpoint, no sensitive data leaks
- Security — rate limiting, CSRF, headers, request ID propagation

---

## Maya's Tool Belt

| Tool | Description |
|------|-------------|
| `verify_service_area` | Checks if customer's zip code is in service area |
| `calculate_quote` | Dynamic pricing for vehicle type, condition, add-ons |
| `check_weather` | Weather forecast for outdoor appointments |
| `get_availability` | Real-time Google Calendar slot lookup |
| `generate_deposit_link` | Creates LemonSqueezy/Stripe checkout session |
| `sync_booking_state` | Persists customer data across conversation turns |
| `send_confirmation` | SMS + email confirmation with booking details |
| `schedule_followup` | Automated follow-up message scheduling |
| `analyze_vehicle_photo` | Acknowledges uploaded photos for AI vision analysis |
| `check_promo_eligibility` | Loyalty program eligibility check |
| `process_refund` | Dual-provider refund with cancellation |
| `get_customer_history` | Past bookings and loyalty status |
| `lookup_customer` | Customer data retrieval by phone/email |
| `update_customer_data` | Update customer preferences and notes |

---

## Agent Workflow

Maya operates as an autonomous agent with a tool-calling loop:

```
Customer Message
    │
    ▼
Language Detection (EN/ES)
    │
    ▼
Load Business Config (multi-tenant)
    │
    ▼
Prompt Injection Check (all user messages)
    │
    ├──► Injection detected → Safe redirect response
    │
    ▼
LLM Call (Gemini → DeepSeek → OpenAI via circuit breaker)
    │
    ├──► Tool calls → Execute tools → Feed results back → LLM call (loop, max 5 iterations)
    │
    ▼
Final Response
    │
    ▼
Persist Session (Supabase)
    │
    ▼
Send to Customer
```

---

## Security

### Defense in Depth

| Layer | Protection |
|-------|-----------|
| **Edge** | Vercel DDoS protection, rate limiting (Redis + in-memory fallback) |
| **Application** | Zod input validation, CSRF tokens, request ID propagation |
| **Authentication** | JWT with server-side revocation, timing-safe comparisons |
| **Authorization** | Multi-tenant business isolation (`business_id` on every query) |
| **Data** | AES-256-GCM encryption at rest, PII redaction in all logs |
| **External** | HMAC webhook verification (Meta, Stripe, LemonSqueezy, Google) |
| **AI** | Prompt injection detection (first-layer canary), circuit breaker |

### Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Chat API | 20 requests/session | 1 minute |
| Chat API | 30 requests/IP | 1 minute |
| Dashboard Login | 5 attempts/IP | 15 minutes |
| Webhook | 30 requests/IP | 1 minute |

### Compliance

- **TCPA** — SMS consent tracked per customer
- **PII** — Customer data encrypted at rest, never logged in plaintext
- **PCI** — LemonSqueezy/Stripe handle all card data (never touches our servers)
- **GDPR** — Data export + deletion on request

---

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Connect repo to Vercel
3. Set environment variables (see [DEPLOY.md](DEPLOY.md) for full list)
4. Run SQL migrations in Supabase
5. Deploy — zero config needed

### Manual Deployment

```bash
npm run build
npm start
```

### Staging

See [STAGING.md](STAGING.md) for:
- Separate Supabase project setup
- Vercel per-branch previews (Preview environment, free tier)
- Stripe/LemonSqueezy test-mode credentials
- Verification checklist

---

## Environment Variables

**Required** (app crashes without these):

| Variable | Purpose |
|----------|---------|
| `DASHBOARD_PASSWORD` | Dashboard login password |
| `DASHBOARD_SESSION_SECRET` | JWT signing secret (min 32 chars) |
| `ADMIN_API_SECRET` | Admin endpoint auth (min 32 chars) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key (server-only) |
| `LEMONSQUEEZY_API_KEY` | LemonSqueezy API key |
| `LEMONSQUEEZY_STORE_ID` | LemonSqueezy store ID |
| `LEMONSQUEEZY_VARIANT_ID` | LemonSqueezy variant ID |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | LemonSqueezy webhook secret |

**Optional** (features gracefully disable):

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Primary AI engine |
| `DEEPSEEK_API_KEY` | AI fallback #1 |
| `OPENAI_API_KEY` | AI fallback #2 |
| `STRIPE_SECRET_KEY` | Payment fallback |
| `TWILIO_*` | SMS delivery |
| `RESEND_API_KEY` | Email delivery |
| `GOOGLE_CALENDAR_*` | Calendar sync |
| `META_*` | Messenger/Instagram |
| `ENCRYPTION_KEY` | PII encryption at rest |
| `UPSTASH_REDIS_*` | Distributed rate limiting |

See [`.env.example`](.env.example) for the complete list with documentation.

---

## Roadmap

### Phase 1 — Core Booking Agent
- [x] AI chat with tool calling
- [x] Google Calendar sync
- [x] Stripe deposit collection
- [x] Twilio SMS alerts
- [x] Owner dashboard with analytics

### Phase 2 — Production Hardening
- [x] Multi-tenant data model
- [x] Bilingual support (EN/ES)
- [x] Rate limiting + security
- [x] Meta Messenger + Instagram
- [x] Google Business Profile
- [x] Jobber CRM integration
- [x] Vehicle photo uploads
- [x] LemonSqueezy payment migration
- [x] PII encryption at rest

### Phase 3 — Scale
- [x] Circuit breaker for AI failover
- [x] Structured JSON logging
- [x] API versioning (/api/v1/*)
- [x] Environment validation (production fail-closed)
- [x] 243 unit tests + 30 E2E tests
- [x] In-memory rate limit fallback
- [x] Paginated database queries

### Phase 4 — Growth
- [ ] Multi-language expansion (French, Vietnamese)
- [ ] Advanced analytics (ML-based demand forecasting)
- [ ] White-label deployment portal
- [ ] Mobile app for owners
- [ ] Voice AI (phone calls)

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm test`) and lint (`npm run lint`)
4. Commit your changes (`git commit -m 'feat: add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Built with Purpose

This project was built to solve a real problem: mobile detailers losing thousands of dollars per month to slow response times and missed inquiries. Every feature, every line of code is designed to convert more visitors into paying customers.

**Maya isn't a chatbot. She's a booking machine.**

---

<div align="center">

### Ready to Stop Losing Customers?

**[Deploy to Vercel](https://vercel.com/new/clone?repository-url=https://github.com/Mr-Cleaner-AI-Employee/Mr-Cleaner-AI-Employee)** · **[View Live Demo](https://mr-cleaner.vercel.app)** · **[Report Bug](https://github.com/Mr-Cleaner-AI-Employee/Mr-Cleaner-AI-Employee/issues)**

---

Built by [Ismail Sajid](https://github.com/Ismail-2001)

</div>
