<div align="center">

# Maya — AI Booking Agent for Mobile Detailing

### Turn website visitors into confirmed, paid bookings — without hiring a single person

![Version](https://img.shields.io/badge/version-0.1.0-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Tests](https://img.shields.io/badge/tests-243%20unit%20%2B%2028%20E2E-brightgreen?style=flat-square)
![Lint](https://img.shields.io/badge/lint-0%20errors-brightgreen?style=flat-square)
![Node](https://img.shields.io/badge/node-20.x-339933?style=flat-square&logo=node.js&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js&logoColor=white)
![API](https://img.shields.io/badge/api-30%20routes-blue?style=flat-square)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Ismail-2001/Mr-Cleaner-AI-Employee)

**Stop losing customers to slow responses. Let Maya book while you work.**

</div>

---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [System Overview](#system-overview)
- [Quick Start](#quick-start)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Security](#security)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)
- [Operations Runbook](#operations-runbook)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

---

## Why This Exists

You're a busy mobile detailer. A potential customer visits your website at 9 PM on a Tuesday. They want to book a ceramic coating for their BMW X5 next Saturday. But you're elbow-deep in a correction job, your phone is in the shop, and by the time you see the message at 6 AM Wednesday — they've already booked with your competitor.

**This costs you $400–$800 per lost booking. That's $4,000–$8,000 per month in missed revenue.**

**Maya** is a 24/7 AI concierge that works like a full-time receptionist, dispatcher, and sales team — but costs nothing monthly and never sleeps.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CUSTOMER CHANNELS (6)                          │
│  Web Chat  │  Messenger  │  Instagram  │  WhatsApp  │  GBP  │  SMS    │
└───────────────────────┬─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      API LAYER (30 routes)                            │
│  /api/chat  │  /api/webhook/*  │  /api/bookings  │  /api/dashboard/*  │
│  /api/health  │  /api/cron/*  │  /api/v1/*  │  /api/upload            │
└───────────────────────┬─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  MAYA ORCHESTRATION ENGINE (maestro.js)                │
│                                                                         │
│  Language Detection → Business Config → Prompt Injection Guard          │
│         │                                                               │
│         ▼                                                               │
│  AI Model Router ──► Gemini 2.0 Flash (primary)                        │
│         │          ──► DeepSeek (fallback #1)                           │
│         │          ──► OpenAI GPT-4o (fallback #2)                      │
│         │          ──► Circuit Breaker (3 fails → 60s cooldown)        │
│         │                                                               │
│         ▼                                                               │
│  Tool-Calling Loop ──► 10 tools ──► max 5 iterations ──► 50K token cap │
│         │                                                               │
│         ▼                                                               │
│  Output Validation (Zod) → PII Redaction → Session Persist             │
└───────────────────────┬─────────────────────────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
┌──────────────┐ ┌────────────┐ ┌──────────────┐
│  SUPABASE    │ │  EXTERNAL  │ │  PAYMENTS    │
│  PostgreSQL  │ │  SERVICES  │ │              │
│  • Bookings  │ │  • GCal     │ │  • LemonSq.  │
│  • Sessions  │ │  • Twilio   │ │  • Stripe    │
│  • Customers │ │  • Resend   │ │              │
│  • Analytics │ │  • Meta     │ │              │
│  • PII (AES) │ │  • GBP      │ │              │
└──────────────┘ └────────────┘ └──────────────┘
          │
          ▼
┌──────────────────────────────────────────┐
│  UPSTASH REDIS (optional)               │
│  • Rate limiting (in-memory fallback)   │
│  • Circuit breaker state                │
│  • Session revocation                   │
└──────────────────────────────────────────┘
```

**Key design decisions:**

| Decision | Why |
|----------|-----|
| **Single orchestration engine** (`lib/maestro.js`) | One code path for all 6 channels — no logic drift |
| **Tool-calling loop** (max 5 iterations) | AI decides which tools to call; results feed back until it can respond |
| **Circuit breaker** (3 fails → 60s cooldown) | Gemini down? Skip to DeepSeek automatically; persists to Redis across cold starts |
| **Dual payment providers** | LemonSqueezy primary (Pakistan-compatible), Stripe fallback |
| **Multi-tenant by default** | Every query scoped by `business_id`; zero cross-tenant data leaks |
| **Fail-closed environment validation** | Production crashes if critical secrets are missing — no silent misconfiguration |

---

## Quick Start

### Prerequisites

- **Node.js 20.x** (LTS)
- **Supabase account** (free tier works)
- **Gemini API key** (free tier: 15 requests/min) — [get one here](https://aistudio.google.com/app/apikey)

### 1. Clone & Install

```bash
git clone https://github.com/Ismail-2001/Mr-Cleaner-AI-Employee.git
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
DASHBOARD_SESSION_SECRET=generate_with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ADMIN_API_SECRET=generate_with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CRON_SECRET=generate_with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx

# Payment — LemonSqueezy (primary)
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

-- 6. Payment provider tracking
\i supabase/0006_payment_provider_column.sql
```

Or use the migration runner:

```bash
npm run db:migrate
```

### 4. Start Development

```bash
npm run dev
```

Visit **http://localhost:3000** — Maya is live.

### 5. Verify Installation

```bash
# Health check
curl http://localhost:3000/api/health

# Run tests (243 unit tests)
npm test

# Run E2E tests (28 API-level tests)
npm run test:e2e
```

### 6. Deploy to Vercel

```bash
npx vercel --prod
```

Or connect your GitHub repo to Vercel for auto-deploys on every push. See [DEPLOY.md](DEPLOY.md) for the full production checklist.

---

## Features

### Booking Intelligence
- **Service area verification** — checks zip codes before proceeding
- **Dynamic pricing** — adjusts for vehicle type, condition, and add-ons
- **Calendar sync** — real-time Google Calendar integration, no double-bookings
- **Deposit collection** — LemonSqueezy (primary) or Stripe checkout, pre-collected
- **Weather awareness** — warns about outdoor appointments, suggests alternatives
- **Loyalty program** — points tracking, redemption, eligibility checks

### Multi-Channel Presence (6 channels)
| Channel | Endpoint | Use Case |
|---------|----------|----------|
| Web Chat Widget | `/api/chat` | Website visitors |
| Meta Messenger | `/api/webhook/meta` | Facebook Page DMs |
| Instagram DMs | `/api/webhook/meta` | Instagram Direct Messages |
| WhatsApp Business | `/api/webhook/meta` | WhatsApp Cloud API |
| Google Business Profile | `/api/webhook/google` | Review replies, auto-responses |
| SMS via Twilio | Cron jobs | Lead alerts, confirmations |

### Bilingual Support (English & Spanish)
- Automatic detection from first message (accented chars + 60+ Spanish words)
- Professional US Hispanic register
- Auto-detailing terminology translations
- Seamless language switching mid-conversation

### Owner Dashboard
| Page | Features |
|------|----------|
| **Bookings** | Search, filter, status badges, CSV export, detail view |
| **Calendar** | Month/Week/Day views, color-coded by service type |
| **Analytics** | Revenue trends, conversion funnel, peak hours, date range filtering |
| **Intelligence** | AI-powered insights, forecasts, no-show risk alerts |
| **Settings** | Deposit amount, packages, service area, hours, notifications, integrations |
| **Reasoning Log** | Real-time AI decision transparency (15s auto-refresh) |

### Enterprise Security
| Protection | Implementation |
|-----------|----------------|
| **Rate limiting** | Per-session + per-IP (Redis with in-memory fallback) |
| **Prompt injection guard** | First-layer canary detection on all user messages |
| **PII encryption** | AES-256-GCM at rest for customer data |
| **PII redaction** | Stripped from all logs and LLM responses |
| **HMAC webhook verification** | Meta, Stripe, LemonSqueezy, Google |
| **Circuit breaker** | 3 failures → OPEN → 60s cooldown → HALF-OPEN (Redis-persisted) |
| **JWT sessions** | Server-side revocation via Redis, 8-hour lifetime |
| **CSRF protection** | Origin/Referer validation on all state-changing requests |
| **Request ID propagation** | X-Request-Id flows through entire request lifecycle |
| **Environment validation** | Throws in production when critical vars are missing |

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Runtime** | Node.js 20.x | LTS, native ESM, serverless-optimized |
| **Framework** | Next.js 16 (App Router) | Server components, API routes, zero-config deploy |
| **Frontend** | React 19 + CSS Modules | Zero-runtime, dark mode, Framer Motion animations |
| **AI Engine** | Gemini 2.0 Flash (primary) | Fast, free tier, 15 RPM |
| **AI Fallback** | DeepSeek → OpenAI GPT-4o | Graceful degradation on failure |
| **Database** | Supabase (PostgreSQL) | Managed, real-time, free tier |
| **Cache** | Upstash Redis (optional) | Rate limiting, circuit breaker, session revocation |
| **Payments** | LemonSqueezy (primary) | Pakistan-compatible, webhook-verified |
| **Payments (fallback)** | Stripe | Industry-standard, deposit collection |
| **Calendar** | Google Calendar API | Real-time sync, no double-bookings |
| **SMS** | Twilio (3-retry + fallback) | Reliable delivery, TCPA-compliant |
| **Email** | Resend | Clean templates, free 100/day |
| **Auth** | JWT (jose) | Stateless, server-side revocation |
| **Monitoring** | Sentry + structured JSON logs | Error tracking, request tracing |
| **Validation** | Zod v4 schemas | Type-safe input/output validation at every boundary |
| **Testing** | Vitest (unit) + Playwright (E2E) | 243 unit tests + 28 API-level E2E tests |
| **Deployment** | Vercel (zero-config) | Auto-deploy on push, edge functions |
| **CI** | GitHub Actions | Lint → unit tests → build → E2E (sequential) |

---

## Architecture

### Orchestration Flow

```
Customer Message
    │
    ▼
Language Detection (EN/ES heuristic)
    │
    ▼
Load Business Config (multi-tenant, 15-min cache)
    │
    ▼
Prompt Injection Check (all user messages)
    │
    ├──► Injection detected → Safe redirect response
    │
    ▼
LLM Call (Gemini → DeepSeek → OpenAI via circuit breaker)
    │
    ├──► Tool calls → Execute tools → Feed results → LLM call
    │    (max 5 iterations, 50K token budget)
    │
    ▼
Output Validation (Zod schema)
    │
    ├──► Validation failed → Safe fallback response
    │
    ▼
PII Redaction (strip customer data from response)
    │
    ▼
Persist Session (Supabase + Redis)
    │
    ▼
Send to Customer
```

### AI Model Failover

```
Request arrives
    │
    ▼
┌─ Circuit Breaker Check ─┐
│  gemini: CLOSED? ────── YES ──► Try Gemini (2s timeout)
│  gemini: OPEN? ──────── NO ───┐
│                               │
│  deepseek: CLOSED? ──── YES ──► Try DeepSeek (2s timeout)
│  deepseek: OPEN? ────── NO ───┐
│                               │
│  openai: CLOSED? ────── YES ──► Try GPT-4o (2s timeout)
│  openai: OPEN? ──────── NO ───┐
│                               │
│  All open ──────────────────► Return error (503)
└───────────────────────────────┘
```

**Circuit breaker states:**
- `CLOSED` — healthy, normal operation
- `OPEN` — 3 consecutive failures, skip for 60 seconds
- `HALF-OPEN` — cooldown expired, try one probe request

State persists to Redis across serverless cold starts.

---

## Project Structure

```
├── app/                              Next.js App Router (30 API routes)
│   ├── api/
│   │   ├── chat/                     Maya chat endpoint (main entry point)
│   │   ├── bookings/                 Booking CRUD (paginated, encrypted PII)
│   │   ├── calendar/                 Calendar availability
│   │   ├── stripe/webhook/           Stripe payment events (HMAC verified)
│   │   ├── lemonsqueezy/webhook/     LemonSqueezy payment events (HMAC verified)
│   │   ├── dashboard/                Auth, analytics, CSV export, settings, refund, logout
│   │   ├── webhook/                  Meta (Messenger/IG/WhatsApp), Google Business
│   │   ├── cron/daily-summary/       Scheduled daily owner summary
│   │   ├── integrations/             Jobber CRM, Google OAuth
│   │   ├── health/                   GET public, POST verbose (CRON_SECRET)
│   │   ├── admin/rate-limit/         Rate limit reset (ADMIN_API_SECRET)
│   │   ├── upload/                   Vehicle photo upload
│   │   ├── config/                   Landing page config endpoint
│   │   └── v1/                       API versioning (/api/v1/*)
│   ├── dashboard/                    Owner dashboard UI (login + main)
│   ├── booking/                      Customer-facing booking pages
│   ├── setup/                        Onboarding wizard
│   └── page.js                       Landing page (multi-tenant config)
│
├── lib/                              Core business logic (33 modules)
│   ├── maestro.js                    Orchestration engine (shared across all channels)
│   ├── ai-agent.js                   System prompt + LOCALES registry
│   ├── tools.js                      10 tool functions (Zod-guarded)
│   ├── output-validator.js           LLM response validation
│   ├── logger.js                     Structured JSON logger
│   ├── circuit-breaker.js            AI model circuit breaker (Redis-persisted)
│   ├── calendar.js                   Google Calendar integration
│   ├── stripe.js                     Stripe payment processing (fallback)
│   ├── lemon-squeezy.js              LemonSqueezy API client (primary)
│   ├── twilio.js                     SMS with 3-retry + fallback
│   ├── email.js                      Bilingual email templates
│   ├── meta.js                       Meta Messenger + Instagram + WhatsApp
│   ├── gbp.js                        Google Business Profile
│   ├── jobber.js                     Jobber CRM integration
│   ├── redis.js                      Shared Redis client (lazy-init, optional)
│   ├── rate-limit.js                 Multi-tier rate limiting (Redis + in-memory)
│   ├── session.js                    JWT session management
│   ├── revocation.js                 Redis-first session revocation (O(1))
│   ├── tenant.js                     Multi-tenant business resolution
│   ├── supabase.js                   Database ops (paginated, encrypted PII)
│   ├── supabase-admin.js             Singleton Supabase client
│   ├── photo-upload.js               Vehicle photo processing
│   ├── refund.js                     Dual-provider refund (idempotent)
│   ├── pii-redact.js                 PII scrubbing for logs
│   ├── pii-encrypt.js                AES-256-GCM encryption at rest
│   ├── api-validation.js             Zod v4 request/response validation
│   ├── business-config.js            Multi-tenant landing config loader
│   ├── env-helpers.js                envBool() / envInt() coercion
│   ├── csrf.js                       CSRF token generation
│   ├── validate-env.js               Startup env validation (fail-closed)
│   ├── validate-request.js           Zod request validation
│   ├── timeout.js                    withTimeout / withAbortTimeout helpers
│   └── pii-redact.js                 PII scrubbing
│
├── components/                       React components (27 files)
│   ├── dashboard/                    Dashboard UI (Analytics, BookingsTable,
│   │                                 CalendarGrid, ReasoningLog, Settings,
│   │                                 Sidebar, StatCards)
│   ├── ChatInterface.js              AI chat widget
│   ├── ChatButton.js                 Floating action button
│   ├── Hero.js                       Animated hero section
│   ├── ServiceMenu.js                Service cards + modals
│   ├── Testimonials.js               Social proof section
│   ├── StatsCounter.js               Animated statistics
│   ├── BeforeAfterSlider.js          Image comparison
│   ├── Navbar.js                     Scroll-aware navigation
│   ├── ErrorBoundary.js              Client error boundary
│   ├── RootErrorBoundary.js          Root error boundary
│   ├── PageLoader.js                 Page loading state
│   └── ...                           Animation utilities (TiltCard,
│                                     MagneticButton, FloatingParticles, etc.)
│
├── tests/                            243 unit/integration tests (22 files)
├── e2e/                              28 Playwright E2E tests (5 spec files)
├── supabase/                         10 SQL schemas + migrations
├── scripts/migrate.js                Database migration runner
│
├── middleware.js                     CSRF, security headers, request ID
├── playwright.config.js              E2E config (API-level, no browser)
├── vitest.config.js                  Unit test config
├── sentry.client.config.js           Sentry client setup
├── sentry.server.config.js           Sentry server setup
│
├── DEPLOY.md                         Production deployment checklist
├── STAGING.md                        Staging environment setup
├── ARCHITECTURE.md                   Architecture decision records
├── AUDIT.md                          FAANG-level security audit
├── KNOWN_ISSUES.md                   Known limitations
├── SECURITY_CHANGELOG.md             Vulnerability fix history
├── SUPABASE_SETUP.md                 Supabase setup guide
├── GEMINI_SETUP.md                   Gemini API key setup
└── CHANGELOG.md                      Release notes
```

---

## API Reference

**30 API routes** across 7 categories. All routes return structured errors with `request_id` for tracing.

### Chat

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/chat` | Rate limit | Maya chat — main entry point |
| `POST` | `/api/v1/chat` | Rate limit | Maya chat — versioned route |

### Bookings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/bookings` | Session | List bookings (paginated) |
| `POST` | `/api/bookings` | Rate limit | Create booking |
| `GET` | `/api/v1/bookings` | Session | List bookings — versioned |
| `POST` | `/api/v1/bookings` | Rate limit | Create booking — versioned |

### Payments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/stripe/webhook` | HMAC | Stripe payment events |
| `POST` | `/api/lemonsqueezy/webhook` | HMAC | LemonSqueezy payment events |

### Dashboard

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/dashboard/auth` | Rate limit | Dashboard login |
| `POST` | `/api/dashboard/logout` | Session | Dashboard logout |
| `GET` | `/api/dashboard/analytics` | Session | Analytics with date range filtering |
| `GET` | `/api/dashboard/analytics/export` | Session | CSV export |
| `GET` | `/api/dashboard/settings` | Session | Business settings |
| `PUT` | `/api/dashboard/settings` | Session | Update business settings |
| `POST` | `/api/dashboard/refund` | Session | Process refund (dual-provider, idempotent) |

### Webhooks

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/webhook/meta` | HMAC | Meta Messenger/Instagram/WhatsApp |
| `GET` | `/api/webhook/meta` | Verify token | Meta verification |
| `POST` | `/api/webhook/google` | HMAC | Google Business webhook |
| `POST` | `/api/webhook/meta/process` | Internal | Async message processing |

### Integrations

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/auth/google` | OAuth | Google OAuth start |
| `GET` | `/api/auth/callback/google` | OAuth | Google OAuth callback |
| `GET/POST` | `/api/integrations/jobber/*` | OAuth | Jobber CRM sync |
| `POST` | `/api/integrations/google/disconnect` | Session | Disconnect Google |

### Operations

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/health` | None | System health check (public) |
| `POST` | `/api/health` | Bearer | Verbose health (admin only) |
| `GET` | `/api/v1/health` | Session | Health check — versioned |
| `POST` | `/api/cron/daily-summary` | Bearer | Daily owner summary |
| `POST` | `/api/admin/rate-limit/reset` | Bearer | Reset rate limits |
| `POST` | `/api/upload` | Rate limit | Vehicle photo upload |
| `GET` | `/api/config` | None | Landing page config |

---

## Testing

### Unit & Integration Tests (Vitest)

```bash
npm test                    # Run all 243 tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

**243 tests across 22 files:**

| Module | Tests | Coverage |
|--------|-------|----------|
| Tool execution | 30 | All 10 tools, edge cases, validation |
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
| Refunds | 10 | Dual-provider, idempotency, optimistic locking |
| Tenant isolation | 9 | Business-scoped queries, cross-tenant leak prevention |
| Circuit breaker | 9 | CLOSED/OPEN/HALF-OPEN, Redis persistence |
| Sessions | 7 | JWT creation, validation, revocation |
| Environment | 5 | Required vars, fail-closed, type coercion |
| Runtime resilience | 4 | Null clients, malformed cache, graceful degradation |
| Webhook revenue | 4 | Payment verification, deposit integrity |
| Booking concurrency | 2 | Race conditions, slot conflict detection |

### E2E Tests (Playwright)

```bash
npm run test:e2e            # Run against local server
npm run test:e2e:ui         # Interactive UI mode
```

**28 API-level E2E tests** (no browser — deterministic, fast):

| Spec | Tests | Coverage |
|------|-------|----------|
| `health.spec.js` | 6 | GET/POST health, no-cache headers, no sensitive data leaks, admin auth |
| `auth.spec.js` | 8 | Login, wrong password, empty password, session cookie, protected routes |
| `chat.spec.js` | 6 | Request validation, session management, SSE streaming, fallback |
| `bookings.spec.js` | 5 | 401 without session, authenticated flow, availability |
| `security.spec.js` | 5 | Headers, CSRF, rate limiting, v1 routing |

### CI Pipeline

```yaml
# .github/workflows/ci.yml
Job 1: test         → eslint + npm test (243 tests)
Job 2: build-and-e2e → next build + playwright (28 tests) + artifact upload
# Job 2 runs only after Job 1 passes
```

---

## Maya's Tool Belt

**10 tools** — all Zod-guarded, PII-redacted in logs:

| Tool | Description | External Call |
|------|-------------|---------------|
| `verify_service_area` | Check if customer's zip is in service area | None |
| `calculate_quote` | Dynamic pricing (service × vehicle × condition) | DB lookup |
| `check_weather` | Weather forecast for outdoor appointments | OpenWeather API |
| `get_availability` | Real-time Google Calendar slot lookup | Google Calendar |
| `generate_deposit_link` | Create LemonSqueezy/Stripe checkout session | Payment API |
| `sync_booking_state` | Persist customer data across conversation turns | Supabase |
| `query_knowledge` | Business knowledge base (pricing, policies, service area) | DB/Redis cache |
| `analyze_vehicle_photo` | Acknowledge uploaded photos for AI vision analysis | Supabase Storage |
| `check_loyalty_points` | Loyalty program eligibility check | Supabase |
| `redeem_loyalty_points` | Redeem loyalty points | Supabase |

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
| **Startup** | Environment validation — production crashes if secrets missing |

### Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Chat API | 20 requests/session | 1 minute |
| Chat API | 30 requests/IP | 1 minute |
| Bookings | 5 requests/IP | 1 minute |
| Dashboard Login | 5 attempts/IP | 15 minutes |
| Webhooks | 30 requests/IP | 1 minute |

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
3. Set environment variables (see [DEPLOY.md](DEPLOY.md))
4. Run SQL migrations in Supabase
5. Deploy — zero config needed

### Manual Deployment

```bash
npm run build
npm start
```

### Staging Environment

See [STAGING.md](STAGING.md) for:
- Separate Supabase project setup
- Vercel per-branch previews (Preview environment, free tier)
- LemonSqueezy/Stripe test-mode credentials
- Verification checklist

---

## Environment Variables

### Required (app crashes without these)

| Variable | Purpose | How to Generate |
|----------|---------|-----------------|
| `DASHBOARD_PASSWORD` | Dashboard login | Choose a strong password |
| `DASHBOARD_SESSION_SECRET` | JWT signing key | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_API_SECRET` | Admin endpoint auth | Same command (use different value) |
| `CRON_SECRET` | Health verbose + cron auth | Same command (use different value) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key | Same page |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key (server-only) | Same page — **never expose to client** |
| `LEMONSQUEEZY_API_KEY` | LemonSqueezy API key | LS Dashboard → Settings → API |
| `LEMONSQUEEZY_STORE_ID` | LemonSqueezy store ID | LS Dashboard → Settings |
| `LEMONSQUEEZY_VARIANT_ID` | LemonSqueezy variant ID | LS Dashboard → Products → Variant |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | LemonSqueezy webhook secret | LS Dashboard → Settings → Webhooks |

### Optional (features gracefully disable)

| Variable | Purpose | Graceful Degradation |
|----------|---------|---------------------|
| `GEMINI_API_KEY` | Primary AI engine | Simulation mode (no AI responses) |
| `DEEPSEEK_API_KEY` | AI fallback #1 | Skipped |
| `OPENAI_API_KEY` | AI fallback #2 | Skipped |
| `STRIPE_SECRET_KEY` | Payment fallback | LemonSqueezy only |
| `TWILIO_*` | SMS delivery | No SMS sent |
| `RESEND_API_KEY` | Email delivery | No emails sent |
| `GOOGLE_CALENDAR_*` | Calendar sync | Availability returns static slots |
| `META_*` | Messenger/Instagram/WhatsApp | Channel disabled |
| `ENCRYPTION_KEY` | PII encryption at rest | PII stored unencrypted (dev only) |
| `UPSTASH_REDIS_*` | Distributed rate limiting | In-memory fallback (per-process) |
| `SENTRY_DSN` | Error tracking | Console logging only |
| `USE_REDIS=true` | Enable Redis | Defaults to false (in-memory) |

See [`.env.example`](.env.example) for the complete list with documentation.

---

## Operations Runbook

### Health Check

```bash
# Public health (no auth)
curl https://yourdomain.com/api/health

# Verbose health (requires CRON_SECRET)
curl -X POST https://yourdomain.com/api/health \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Expected response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-10-04T10:00:00.000Z",
  "uptime_sec": 12345,
  "response_time_ms": 42,
  "ai_providers": { "gemini": "ok", "deepseek": "ok", "openai": "ok" },
  "integrations": { "supabase": "ok", "redis": "disabled", "twilio": "ok" },
  "circuit_breakers": [
    { "name": "gemini", "state": "CLOSED", "failureCount": 0 }
  ]
}
```

### Common Operations

| Task | Command |
|------|---------|
| Reset rate limits | `curl -X POST /api/admin/rate-limit/reset -H "Authorization: Bearer $ADMIN_API_SECRET"` |
| Reset circuit breakers | Automatic after 60s cooldown |
| Check AI provider status | `POST /api/health` (verbose) |
| Run migrations | `npm run db:migrate` |
| View logs | Structured JSON in Vercel dashboard |
| Check errors | Sentry dashboard |

### Incident Response

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| Chat returns "simulation mode" | No AI API key set | Set `GEMINI_API_KEY` in env |
| All bookings fail | Supabase connection | Check `SUPABASE_SERVICE_ROLE_KEY` |
| Rate limiting not working | Redis unavailable | Check `UPSTASH_REDIS_*` env vars; in-memory fallback active |
| AI responses slow/failing | Circuit breaker OPEN | Wait 60s; check `POST /api/health` for breaker states |
| Webhook 401 errors | HMAC signature mismatch | Verify webhook secret matches provider dashboard |
| 503 on health check | Service degraded | Check Sentry for errors; check verbose health endpoint |
| Booking double-booked | Race condition | DB unique constraint `idx_unique_slot` is hard backstop; check logs for `23505` |

---

## Troubleshooting

### Common Issues

**Q: `npm run dev` fails with port already in use**
```bash
# Kill process on port 3000
npx kill-port 3000
npm run dev
```

**Q: Tests fail with "Admin client disabled" warning**
```
CRITICAL: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL missing.
```
This is expected in CI — tests mock Supabase. Set the env vars locally if you need live DB tests.

**Q: Chat returns simulation message**
```env
# Add to .env.local
GEMINI_API_KEY=your_key_here
```
Restart dev server after changing env vars.

**Q: Rate limiter blocks legitimate requests**
```bash
# Reset rate limits
curl -X POST http://localhost:3000/api/admin/rate-limit/reset \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

**Q: E2E tests fail with timeout**
```bash
# Ensure production build exists first
npm run build
npm run test:e2e
```

**Q: Supabase migrations fail**
- Run migrations in order (see Quick Start step 3)
- Check for duplicate runs: `SELECT * FROM _migrations;`

---

## Roadmap

### Phase 1 — Core Booking Agent ✅
- [x] AI chat with tool calling
- [x] Google Calendar sync
- [x] Stripe deposit collection
- [x] Twilio SMS alerts
- [x] Owner dashboard with analytics

### Phase 2 — Production Hardening ✅
- [x] Multi-tenant data model
- [x] Bilingual support (EN/ES)
- [x] Rate limiting + security
- [x] Meta Messenger + Instagram + WhatsApp
- [x] Google Business Profile
- [x] Jobber CRM integration
- [x] Vehicle photo uploads
- [x] LemonSqueezy payment migration
- [x] PII encryption at rest

### Phase 3 — Enterprise Scale ✅
- [x] Circuit breaker for AI failover (Redis-persisted)
- [x] Structured JSON logging (all source files)
- [x] API versioning (/api/v1/*)
- [x] Environment validation (production fail-closed)
- [x] 243 unit tests + 28 E2E tests
- [x] Redis-first session revocation (O(1) lookups)
- [x] Token budget per request (50K limit)
- [x] Refund idempotency (optimistic locking)
- [x] GitHub Actions CI (lint → test → build → E2E)
- [x] PII redaction on LLM responses
- [x] CSV analytics export

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
4. Run E2E tests (`npm run test:e2e`)
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines

- **Run `npm test` before submitting** — all 243 tests must pass
- **Run `npm run lint`** — zero errors required
- **Add tests for new features** — maintain or improve coverage
- **Follow existing patterns** — check neighboring files for conventions
- **Never commit secrets** — `.env.local` is gitignored

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

**[Deploy to Vercel](https://vercel.com/new/clone?repository-url=https://github.com/Ismail-2001/Mr-Cleaner-AI-Employee)** · **[View Live Demo](https://mr-cleaner.vercel.app)** · **[Report Bug](https://github.com/Ismail-2001/Mr-Cleaner-AI-Employee/issues)**

---

Built by [Ismail Sajid](https://github.com/Ismail-2001)

</div>
