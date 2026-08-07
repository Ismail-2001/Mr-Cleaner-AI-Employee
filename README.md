<div align="center">

<img src="https://raw.githubusercontent.com/Mr-Cleaner-AI-Employee/assets/main/maya-banner.png" alt="Maya AI Concierge" width="100%" />

# **Maya — AI Booking Agent for Mobile Detailing**

### Turn website visitors into confirmed, paid bookings — without hiring a single person

<br/>

![Version](https://img.shields.io/badge/version-1.0.0-blue?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
![Tests](https://img.shields.io/badge/tests-243%20passing-brightgreen?style=for-the-badge)
![Build](https://img.shields.io/badge/build-30%20routes-success?style=for-the-badge)
![Node](https://img.shields.io/badge/node-20.x-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js&logoColor=white)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Mr-Cleaner-AI-Employee/Mr-Cleaner-AI-Employee)

<br/>

**Stop losing customers to slow responses. Let Maya book while you work.**

</div>

---

## The Problem

You're a busy mobile detailer. A potential customer visits your website at 9 PM on a Tuesday. They want to book a ceramic coating for their BMW X5 next Saturday. But you're elbow-deep in a correction job, your phone is in the shop, and by the time you see the message at 6 AM Wednesday — they've already booked with your competitor.

**This costs you $400–$800 per lost booking. That's $4,000–$8,000 per month in missed revenue.**

## The Solution

**Maya** is a 24/7 AI concierge that works like a full-time receptionist, dispatcher, and sales team — but costs nothing monthly and never sleeps.

She answers questions instantly, quotes accurate prices, checks your calendar, collects deposits, and sends you real-time alerts — all while you're hands-on with a buffer and polish.

---

## Why Detailing Owners Choose Maya

| Pain Point | Without Maya | With Maya |
|---|---|---|
| **After-hours inquiries** | Lost forever | Captured and booked 24/7 |
| **Slow response time** | 2–8 hours | Under 2 seconds |
| **Price quoting** | Manual calculation | Instant, accurate quotes |
| **Calendar management** | Double-bookings, gaps | Real-time Google Calendar sync |
| **Deposit collection** | Venmo/CashApp trust | Stripe checkout, pre-collected |
| **No-shows** | 15–30% of bookings | <5% with deposit commitment |
| **Revenue visibility** | Spreadsheets | Live dashboard with analytics |

---

## Key Features

### Intelligent Booking Flow
- **Service Area Verification** — Checks zip codes before proceeding
- **Dynamic Pricing** — Adjusts for vehicle type, condition, and add-ons
- **Calendar Sync** — Real-time Google Calendar integration, no double-bookings
- **Deposit Collection** — Stripe-powered $50 deposit locks the slot
- **Weather Awareness** — Warns about outdoor appointments, suggests alternatives

### Multi-Channel Presence
- **Web Chat Widget** — Embed on any website
- **Meta Messenger** — Facebook Page integration
- **Instagram DMs** — Automated responses to DMs
- **Google Business Profile** — Review replies and auto-responses
- **SMS via Twilio** — Lead alerts and customer confirmations

### Bilingual Support (English & Spanish)
- **Automatic Detection** — Detects Spanish from the first message
- **US Hispanic Register** — Professional, warm Spanish for US market
- **Terminology Translations** — Auto-detailing terms in Spanish
- **Mixed-Language Handling** — Seamlessly switches when customer switches

### Business Intelligence Dashboard
- **Revenue Tracking** — Week-over-week trends with % change
- **Booking Analytics** — Status breakdown, peak hours, popular services
- **Repeat Customer Visibility** — Track returning customers
- **CSV Export** — Download all booking data for accounting
- **Tool Execution Logs** — See exactly how Maya handles each conversation

### Enterprise-Grade Security
- **Rate Limiting** — Per-session + per-IP (Redis-backed)
- **Prompt Injection Guard** — First-layer canary detection
- **PII Redaction** — Customer data stripped from all logs
- **HMAC Webhook Verification** — Meta, Stripe, Google
- **CSRF Protection** — Token-based form validation
- **SQL Injection Prevention** — Parameterized queries everywhere
- **JWT Sessions** — Server-side revocation, 8-hour lifetime

---

## Architecture

```mermaid
graph TB
    subgraph "Customer Channels"
        WEB[Web Chat Widget]
        MSG[Meta Messenger]
        IG[Instagram DMs]
        GBP[Google Business]
        SMS[SMS via Twilio]
    end

    subgraph "API Layer"
        CHAT["/api/chat"]
        WEBHOOK["/api/webhook/meta"]
        GOOGLE["/api/webhook/google"]
        BOOK["/api/bookings"]
        STripe["/api/stripe/webhook"]
        CRON["/api/cron/*"]
    end

    subgraph "Core Engine"
        MAESTRO[Maya Orchestration Engine]
        AI[Gemini / DeepSeek / OpenAI]
        TOOLS[Tool Executor]
    end

    subgraph "External Services"
        GCAL[Google Calendar API]
        STRIPE[Stripe Payments]
        TWILIO[Twilio SMS]
        RESEND[Resend Email]
    end

    subgraph "Data Layer"
        SUPABASE[(Supabase PostgreSQL)]
        REDIS[(Upstash Redis)]
    end

    subgraph "Observability"
        SENTRY[Sentry Error Monitoring]
        LOGS[Structured Logging]
    end

    WEB --> CHAT
    MSG --> WEBHOOK
    IG --> WEBHOOK
    GBP --> GOOGLE
    SMS --> MAESTRO

    CHAT --> MAESTRO
    WEBHOOK --> MAESTRO
    GOOGLE --> MAESTRO

    MAESTRO --> AI
    MAESTRO --> TOOLS

    TOOLS --> GCAL
    TOOLS --> STRIPE
    MAESTRO --> SUPABASE
    MAESTRO --> REDIS

    STripe --> STRIPE
    MAESTRO --> TWILIO
    MAESTRO --> RESEND

    MAESTRO --> SENTRY
    MAESTRO --> LOGS
```

### Maya's Booking Flow

```mermaid
sequenceDiagram
    participant C as Customer
    participant M as Maya
    participant GC as Google Calendar
    participant ST as Stripe
    participant T as Twilio
    participant DB as Supabase

    C->>M: "I need ceramic coating for my BMW X5"
    M->>M: Detect language (EN/ES)
    M->>DB: Verify service area (zip code)
    M->>M: Calculate dynamic price ($350)
    M->>GC: Check availability (Saturday)
    M->>C: "Saturday 10 AM available. $350 total."
    M->>ST: Create deposit session ($50)
    M->>C: Send payment link
    C->>ST: Pay $50 deposit
    ST->>M: Payment confirmed
    M->>GC: Block slot (2.5 hours)
    M->>T: Send confirmation SMS
    M->>DB: Persist booking + customer data
    M->>C: "You're confirmed! See you Saturday."
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | Next.js 16 + React 19 | SEO-friendly, fast, server components |
| **Styling** | CSS Modules + CSS Variables | Zero-runtime, dark mode, accessibility |
| **Animations** | Framer Motion + Lenis | Smooth scroll, 3D cards, parallax |
| **AI Engine** | Gemini 2.0 Flash (primary) | Fast, free tier, 15 RPM |
| **AI Fallback** | DeepSeek → OpenAI | Graceful degradation on failure |
| **Database** | Supabase (PostgreSQL) | Managed, real-time, free tier |
| **Cache/Queue** | Upstash Redis + QStash | Serverless rate limiting + async jobs |
| **Payments** | Stripe Checkout + Webhooks | PCI-compliant, deposit collection |
| **Calendar** | Google Calendar API | Real-time sync, no double-bookings |
| **SMS** | Twilio (3-retry + fallback) | Reliable delivery, TCPA-compliant |
| **Email** | Resend (bilingual HTML) | Clean templates, free 100/day |
| **Auth** | JWT (jose) + server-side revocation | Secure, stateless sessions |
| **Monitoring** | Sentry + structured logs | Error tracking, request tracing |
| **Validation** | Zod schemas | Type-safe input validation |
| **E2E Testing** | Playwright + Vitest | 208 automated tests |
| **Deployment** | Vercel (zero-config) | Auto-deploy, edge functions |

---

## Screenshots

### Landing Page
![Landing Page](https://raw.githubusercontent.com/Mr-Cleaner-AI-Employee/assets/main/landing-page.png)

### Chat Widget
![Chat Widget](https://raw.githubusercontent.com/Mr-Cleaner-AI-Employee/assets/main/chat-widget.png)

### Owner Dashboard
![Dashboard](https://raw.githubusercontent.com/Mr-Cleaner-AI-Employee/assets/main/dashboard.png)

### Mobile Experience
![Mobile](https://raw.githubusercontent.com/Mr-Cleaner-AI-Employee/assets/main/mobile.png)

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

Edit `.env.local` with your API keys:

```env
# Required — Core
DASHBOARD_PASSWORD=your_password
DASHBOARD_SESSION_SECRET=your_session_secret_64_chars
ADMIN_API_SECRET=your_admin_secret_64_chars
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx

# Required — Payment (LemonSqueezy)
LEMONSQUEEZY_API_KEY=your_ls_key
LEMONSQUEEZY_STORE_ID=your_store_id
LEMONSQUEEZY_VARIANT_ID=your_variant_id
LEMONSQUEEZY_WEBHOOK_SECRET=your_webhook_secret

# Required — Business Info
BUSINESS_NAME=Your Business Name
BUSINESS_PHONE=+1XXXXXXXXXX
BUSINESS_EMAIL=you@business.com
BUSINESS_LOCATION=City, State
BUSINESS_TIMEZONE=America/Chicago

# Required — AI (at least one)
GEMINI_API_KEY=your_gemini_key

# Optional — Security
ENCRYPTION_KEY=your_64_char_hex_key
CRON_SECRET=your_cron_secret

# Optional — Payments (fallback)
STRIPE_SECRET_KEY=your_stripe_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# Optional — Communications
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+15550001234
RESEND_API_KEY=your_resend_key

# Optional — Integrations
GOOGLE_CALENDAR_CLIENT_ID=your_client_id
GOOGLE_CALENDAR_CLIENT_SECRET=your_client_secret
META_ACCESS_TOKEN=your_meta_token
WHATSAPP_PHONE_NUMBER_ID=your_wa_phone_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_wa_biz_id

# Optional — Infrastructure
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token
USE_REDIS=true
QSTASH_TOKEN=your_qstash_token
```

### 3. Initialize Database

Run the schema in your Supabase SQL Editor:

```sql
-- Run supabase/schema.sql first
-- Then supabase/multi-tenancy-migration.sql
-- Then supabase/vehicle-photos-migration.sql
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
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── chat/                 # Maya chat endpoint
│   │   ├── bookings/             # Booking CRUD
│   │   ├── calendar/             # Calendar availability
│   │   ├── stripe/               # Payment processing
│   │   ├── dashboard/            # Owner dashboard + analytics
│   │   ├── cron/                 # Scheduled tasks (daily summary)
│   │   ├── integrations/         # Jobber, third-party
│   │   ├── webhook/              # Meta, Google webhooks
│   │   └── upload/               # Photo uploads
│   ├── booking/                  # Customer-facing booking pages
│   ├── dashboard/                # Owner dashboard UI
│   ├── setup/                    # Onboarding wizard
│   └── page.js                   # Landing page
│
├── lib/                          # Core business logic
│   ├── maestro.js                # Maya orchestration engine
│   ├── ai-agent.js               # System prompt + LOCALES registry
│   ├── tools.js                  # 14 tool functions (quote, calendar, loyalty, etc.)
│   ├── output-validator.js       # LLM response validation (Zod schema)
│   ├── logger.js                 # Structured JSON logger
│   ├── calendar.js               # Google Calendar integration
│   ├── stripe.js                 # Stripe payment processing
│   ├── twilio.js                 # SMS with retry + fallback
│   ├── email.js                  # Bilingual email templates
│   ├── meta.js                   # Meta Messenger + Instagram + WhatsApp
│   ├── gbp.js                    # Google Business Profile
│   ├── jobber.js                 # Jobber CRM integration
│   ├── redis.js                  # Shared Redis client
│   ├── rate-limit.js             # Multi-tier rate limiting
│   ├── session.js                # JWT session management
│   ├── tenant.js                 # Multi-tenant business resolution
│   ├── supabase.js               # Database operations
│   ├── supabase-admin.js         # Singleton Supabase client
│   ├── photo-upload.js           # Vehicle photo processing
│   ├── refund.js                 # Stripe refund logic
│   ├── pii-redact.js             # PII scrubbing for logs
│   ├── csrf.js                   # CSRF token generation
│   ├── circuit-breaker.js        # LLM provider circuit breaker
│   ├── validate-env.js           # Startup env validation (production fail-closed)
│   └── validate-request.js       # Zod request validation
│
├── components/                   # React components
│   ├── ChatInterface.js          # AI chat widget
│   ├── ChatButton.js             # Floating action button
│   ├── Hero.js                   # Animated hero section
│   ├── ServiceMenu.js            # Service cards + modals
│   ├── Testimonials.js           # Social proof section
│   ├── BeforeAfterSlider.js      # Image comparison
│   ├── Navbar.js                 # Scroll-aware navigation
│   └── dashboard/                # Dashboard components
│
├── tests/                        # 243 automated tests
│   ├── maestro.test.js           # Orchestration engine (24 tests)
│   ├── tools.test.js             # Tool execution (30 tests)
│   ├── tenant.test.js            # Multi-tenant isolation (9 tests)
│   ├── rate-limit.test.js        # Rate limiting (17 tests)
│   ├── i18n.test.js              # Bilingual support (15 tests)
│   ├── output-validator.test.js  # LLM output validation (12 tests)
│   ├── csrf.test.js              # CSRF protection (13 tests)
│   ├── circuit-breaker.test.js   # Circuit breaker (9 tests)
│   ├── integration-real.test.js  # Live Supabase (gated)
│   └── ...                       # 12 more test files
│
├── e2e/                          # Playwright E2E tests
│   ├── booking-flow.spec.ts      # Critical booking path
│   └── dashboard.spec.ts         # Dashboard + refund flow
│
├── supabase/                     # Database schemas
│   ├── schema.sql                # Base schema
│   ├── multi-tenancy-migration.sql
│   ├── vehicle-photos-migration.sql
│   ├── 0004_whatsapp_integration.sql
│   └── 0005_loyalty_program.sql
│
├── STAGING.md                    # Staging environment setup
├── SECURITY_CHANGELOG.md         # Audit trail
└── .env.staging.example          # Staging env template
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/chat` | Maya chat — main entry point |
| `POST` | `/api/v1/chat` | Maya chat — versioned route |
| `POST` | `/api/bookings` | Create booking |
| `GET` | `/api/bookings` | List bookings (authenticated) |
| `POST` | `/api/v1/bookings` | Create booking — versioned route |
| `GET` | `/api/v1/bookings` | List bookings — versioned route |
| `GET` | `/api/calendar/availability` | Check available slots |
| `POST` | `/api/stripe/webhook` | Stripe payment events |
| `POST` | `/api/webhook/meta` | Meta Messenger webhook |
| `GET` | `/api/webhook/meta` | Meta verification |
| `POST` | `/api/webhook/google` | Google Business webhook |
| `POST` | `/api/dashboard/auth` | Dashboard login |
| `GET` | `/api/dashboard/analytics` | Analytics with trends |
| `GET` | `/api/dashboard/analytics/export` | CSV export |
| `POST` | `/api/dashboard/refund` | Process refund |
| `PUT` | `/api/dashboard/settings` | Update business settings (auth required) |
| `POST` | `/api/cron/daily-summary` | Daily owner summary |
| `POST` | `/api/integrations/jobber/*` | Jobber CRM sync |
| `POST` | `/api/upload` | Vehicle photo upload (auth required) |
| `POST` | `/api/v1/upload` | Vehicle photo upload — versioned route |
| `GET` | `/api/health` | System health check (uptime, version, env) |
| `GET` | `/api/v1/health` | Health check — versioned route |
| `POST` | `/api/admin/rate-limit/reset` | Reset rate limits (ADMIN_API_SECRET required) |

---

## Agent Workflow

Maya operates as an autonomous agent with a tool-calling loop:

```mermaid
flowchart LR
    A[Customer Message] --> B[Language Detection]
    B --> C[Load Business Config]
    C --> D[Prompt Injection Check]
    D --> E{Injection?}
    E -->|Yes| F[Safe Redirect]
    E -->|No| G[LLM Call]
    G --> H{Tool Calls?}
    H -->|Yes| I[Execute Tools]
    I --> J[Feed Results Back]
    J --> G
    H -->|No| K[Final Response]
    K --> L[Persist Session]
    L --> M[Send to Customer]

    style A fill:#4CAF50,color:#fff
    style F fill:#f44336,color:#fff
    style M fill:#2196F3,color:#fff
```

### Maya's Tool Belt

| Tool | What It Does |
|---|---|
| `verify_service_area` | Checks if customer's zip is in service area |
| `calculate_quote` | Dynamic pricing for vehicle + condition |
| `check_weather` | Weather forecast for outdoor appointments |
| `get_availability` | Real-time Google Calendar slots |
| `generate_deposit_link` | Stripe checkout session ($50 deposit) |
| `sync_booking_state` | Persist customer data across turns |
| `send_confirmation` | SMS + email confirmation |
| `schedule_followup` | Automated follow-up messages |

---

## Security Architecture

### Defense in Depth

| Layer | Protection |
|---|---|
| **Edge** | Vercel DDoS protection, rate limiting |
| **Application** | Zod input validation, CSRF tokens |
| **Authentication** | JWT with server-side revocation |
| **Authorization** | Multi-tenant business isolation |
| **Data** | PII redaction in all logs |
| **External** | HMAC webhook verification |
| **AI** | Prompt injection detection (first-layer canary) |

### Rate Limits

| Endpoint | Limit | Window |
|---|---|---|
| Chat API | 20 requests/session | 1 minute |
| Chat API | 30 requests/IP | 1 minute |
| Dashboard Login | 5 attempts/IP | 15 minutes |
| Webhook | 30 requests/IP | 1 minute |

### Compliance

- **TCPA** — SMS consent tracked per customer
- **PII** — Customer data never logged in plaintext
- **PCI** — Stripe handles all card data (never touches our servers)
- **GDPR** — Data export + deletion on request

---

## Testing

### Unit & Integration Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

**243 tests** across 21 files covering:
- Tool execution (30 tests)
- Maestro orchestration (24 tests)
- Rate limiting (17 tests)
- API validation (16 tests)
- Meta webhooks (16 tests)
- Photo upload (15 tests)
- Internationalization (15 tests)
- CSRF protection (13 tests)
- Output validation (12 tests)
- Error reporting (12 tests)
- Integrations (11 tests)
- Twilio SMS (11 tests)
- Refunds (10 tests)
- Tenant isolation (9 tests)
- Circuit breaker (9 tests)
- Sessions (7 tests)
- Booking concurrency (2 tests)
- Runtime resilience (4 tests)
- Webhook revenue integrity (4 tests)
- Environment validation (5 tests)
- Integration (live Supabase, gated by INTEGRATION_TESTS=true) (1 test)

### E2E Tests (Playwright)

```bash
# Run E2E against staging
npx playwright test

# Interactive UI mode
npx playwright test --ui
```

Tests critical user flows:
- Landing page → chat → booking → success
- Dashboard login → refund flow
- Health check verification

---

## Deployment

See [DEPLOY.md](./DEPLOY.md) for complete production deployment checklist.

### Vercel (Recommended)

1. Push to GitHub
2. Connect repo to Vercel
3. Set environment variables (see DEPLOY.md for full list)
4. Run SQL migrations in Supabase
5. Deploy — zero config needed

### Manual Deployment

```bash
npm run build
npm start
```

### Staging Environment

See [STAGING.md](./STAGING.md) for:
- Separate Supabase project setup
- Vercel per-branch previews
- Stripe/Twilio test-mode credentials
- Verification checklist

---

## Business Use Cases

### Mobile Detailing
- Ceramic coating bookings with deposit collection
- Vehicle condition assessment via chat
- Service area verification by zip code

### Auto Detailing Shops
- Walk-in appointment scheduling
- Package upsell during booking
- Customer history tracking

### Fleet Management
- Multi-vehicle booking for corporate clients
- Recurring service scheduling
- Bulk pricing calculations

### Mobile Car Wash
- Route optimization with service area validation
- Weather-dependent scheduling
- Real-time availability updates

---

## Why Choose Maya Over Alternatives

| Feature | Maya AI | Generic Chatbot | SaaS Booking Tools | Phone Only |
|---|---|---|---|---|
| **24/7 availability** | Yes | Yes | Yes | No |
| **Auto detailer domain knowledge** | Yes | No | No | Partial |
| **Dynamic pricing** | Yes | No | Limited | No |
| **Calendar integration** | Real-time | No | Sometimes | Manual |
| **Deposit collection** | Stripe | No | Varies | No |
| **Multi-channel** | 6 channels | 1–2 | 1–2 | Phone only |
| **Bilingual (EN/ES)** | Yes | No | No | No |
| **AI-powered upsell** | Yes | No | No | Manual |
| **One-time cost** | Yes | Monthly | Monthly | Ongoing |
| **Self-hosted** | Yes | No | No | Yes |
| **Open source** | Yes | No | No | N/A |

---

## Roadmap

### Phase 1 (Complete) — Core Booking Agent
- [x] AI chat with tool calling
- [x] Google Calendar sync
- [x] Stripe deposit collection
- [x] Twilio SMS alerts
- [x] Owner dashboard with analytics

### Phase 2 (Complete) — Production Hardening
- [x] Multi-tenant data model
- [x] Bilingual support (EN/ES)
- [x] Rate limiting + security
- [x] Meta Messenger + Instagram
- [x] Google Business Profile
- [x] Jobber CRM integration
- [x] Vehicle photo uploads
- [x] Staging environment

### Phase 3 (Complete) — Scale
- [x] Multi-language support (EN/ES, data-driven locale registry)
- [x] WhatsApp Business integration
- [x] Customer loyalty program
- [x] LLM output validation (Zod schema)
- [x] Integration tests (live Supabase)
- [x] Structured logging (JSON across 37 files)
- [x] Request ID propagation
- [x] API versioning (/api/v1/*)
- [x] Health check hardening (uptime, response time, version)
- [x] Environment validation (production fail-closed)
- [x] Compression + cache headers
- [x] 8 security fixes (auth, CSRF, TOCTOU, rate-limit secrets)

### Phase 4 (Planned) — Growth
- [ ] Multi-language expansion (French, Vietnamese — add to LOCALES registry)
- [ ] Advanced analytics (ML-based demand forecasting)
- [ ] White-label deployment portal
- [ ] Mobile app for owners
- [ ] Voice AI (phone calls)

---

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Run `npm test` before submitting
- Run `npm run lint` for code style
- Add tests for new features
- Update documentation as needed

---

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.

---

## Acknowledgements

- [Next.js](https://nextjs.org/) — The React framework
- [Supabase](https://supabase.com/) — Open source Firebase alternative
- [Stripe](https://stripe.com/) — Payment infrastructure
- [Twilio](https://www.twilio.com/) — Communication APIs
- [Google Calendar API](https://developers.google.com/calendar) — Scheduling
- [Vercel](https://vercel.com/) — Deployment platform
- [Sentry](https://sentry.io/) — Error monitoring

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

[![Twitter](https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white)](https://twitter.com)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com)
[![Email](https://img.shields.io/badge/Email-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:contact@example.com)

**Stop losing customers to slow responses. Let Maya book while you work.**

</div>
