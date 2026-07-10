<div align="center">

# Mr. Cleaner: Maya AI Concierge
### Visionary AI Agent Platform for Elite Mobile Detailing Enterprises

<br/>

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![Gemini](https://img.shields.io/badge/Gemini-Primary_AI-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![Supabase](https://img.shields.io/badge/Supabase-Persistence-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?style=for-the-badge&logo=stripe&logoColor=white)](https://stripe.com)
[![Google Calendar](https://img.shields.io/badge/Google_Calendar-Real--Time_Sync-4285F4?style=for-the-badge&logo=google-calendar&logoColor=white)](https://calendar.google.com)
[![Twilio](https://img.shields.io/badge/Twilio-Lead_Alerts-F22F46?style=for-the-badge&logo=twilio&logoColor=white)](https://twilio.com)

<br/>

> *"Maya doesn't just chat; she inspects, qualifies, and orchestrates your business intelligence."*

**Mr. Cleaner** is a production-ready, vision-capable AI Agent platform built for high-end automotive detailing businesses. Powered by **Maya (Gemini 2.0 Flash)**, the system performs autonomous vehicle inspections via computer vision, manages intelligent lead qualification, processes payments via Stripe, and provides a cinematic "Owner Portal" for real-time ROI tracking.

[**Features**](#-key-features) · [**Architecture**](#-architecture) · [**Setup**](#-installation) · [**Security**](#-security)

---

</div>

## The Elite Detailing Problem

Traditional booking systems and generic chatbots fail luxury automotive brands:

- **Manual Vehicle Inspection**: Determining a quote currently requires a human to look at photos or the car in person.
- **Lead Drift**: High-intent customers get lost in email threads instead of being qualified instantly.
- **Calendar Conflict**: Scheduling is often a manual back-and-forth between owner and client.
- **Data Blindness**: Business owners don't see the "reasoning path" — why a customer did or didn't book.
- **No Payment Collection**: Deposits are collected via Venmo/CashApp with no formal tracking.

**Mr. Cleaner handles all five.** Maya uses computer vision to inspect vehicle condition, qualifies leads in seconds, syncs directly with Google Calendar, collects deposits via Stripe, and allows owners to update business knowledge via a secure dashboard.

---

## Key Features

### Maya Vision (Computer Vision Inspection)
Maya is configured for visual vehicle assessments (`lib/ai-agent.js`):
- **Body Identification**: Automatically detects if the vehicle is a Sedan, SUV, Truck, or Large SUV.
- **Surface Diagnostics**: Identifies scratches, swirl marks, mud, and oxidation from uploaded photos.
- **Intelligent Upselling**: Recommends "Ceramic Coating" or "Full Correction" based on visual evidence.
- **Visual Evidence Logging**: Stores the "State of Vehicle" in the reasoning trace for quality assurance.

### Decoupled Orchestration Loop
The `app/api/chat/route.js` implements a sophisticated "ReAct" cycle:
1. **System Prompt Injection**: Loads the `MAYA_SYSTEM_PROMPT` containing elite concierge protocols.
2. **Autonomous Tooling**: Maya iteratively calls `get_availability`, `calculate_quote`, `generate_deposit_link`, and `sync_booking_state` before replying.
3. **Max 5 Iterations**: Prevents infinite loops while allowing for complex, multi-tool reasoning chains.
4. **State Persistence**: Customer details are synced to Supabase automatically as they are mentioned.

### Stripe Payment Integration
Real payment collection via `lib/stripe.js`:
- **Deposit Collection**: Generates Stripe Checkout Sessions for booking deposits ($50 default).
- **Webhook Verification**: `app/api/stripe/webhook` validates payment status with signature verification.
- **Idempotent Processing**: Prevents duplicate bookings from webhook retries.
- **Graceful Fallback**: Mock URLs when Stripe is not configured (local dev mode).

### Calendar Sync
Bi-directional integration with Google Calendar (`lib/calendar.js`):
- **Per-Request OAuth**: Fresh client per request to prevent token swap race conditions.
- **DST-Aware Timezone**: Uses `Intl.DateTimeFormat` instead of hardcoded UTC offset.
- **Dynamic Slot Generation**: Checks busy times and generates interval windows between 8 AM and 6 PM.

### Security-First Architecture
Production-grade security (`middleware.js`, `lib/session.js`):
- **JWT Session Auth**: Dashboard protected by jose-signed HS256 cookies.
- **Session Revocation**: Logout invalidates JWTs via Supabase blocklist.
- **Rate Limiting**: Chat (20/min/session), Login (5/15min/IP), Bookings (5/min/IP).
- **Zod Validation**: All API inputs validated against strict schemas.
- **PII Redaction**: Customer names/phones/addresses stripped from all logs.
- **RLS Policies**: Supabase row-level security with anon key restricted to INSERT-only.
- **CSRF Protection**: Origin/Referer header checks on state-changing requests.
- **Security Headers**: CSP, HSTS, X-Frame-Options, nosniff via `next.config.mjs`.

### Intelligence Dashboard (Owner Portal)
A secure Admin UI (`app/dashboard`) for business management:
- **Real-Time KPIs**: Revenue, bookings, tool executions from Supabase.
- **Bookings Table**: Filter by status, view customer details.
- **Live Reasoning Trace**: Watch Maya's internal logs and tool calls in real-time.
- **System Health**: `/api/health` endpoint monitoring Supabase, AI, Stripe, and dashboard status.

---

## Architecture

### Decoupled Orchestration Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Client (Next.js 16)                       │
│  ┌────────────────┐   ┌────────────────┐   ┌─────────────┐  │
│  │ Hero & Landing │   │ Chat Interface │   │ Admin Dash  │  │
│  └──────┬─────────┘   └───────┬────────┘   └──────┬──────┘  │
└─────────┼─────────────────────┼───────────────────┼─────────┘
          │                     │                   │
          ▼                     ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                   Next.js API Orchestrator                   │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Maya Logic Engine (app/api/chat)                     │  │
│  │  • Reasoning Loop (ReAct)                             │  │
│  │  • Tool Guarding (Zod)                                │  │
│  │  • Multi-Model (Gemini / DeepSeek / OpenAI)           │  │
│  └────────┬───────────────────┬───────────────┬──────────┘  │
│           │                   │               │             │
└───────────┼───────────────────┼───────────────┼─────────────┘
            │                   │               │
            ▼                   ▼               ▼
┌──────────────────────┐ ┌───────────────┐ ┌──────────────────┐
│    Persistence       │ │ Integrations  │ │  Security Layer  │
│                      │ │               │ │                  │
│ • Supabase (Postgres)│ │ • Google Cal  │ │ • JWT Sessions   │
│ • Memory Fallback    │ │ • Twilio SMS  │ │ • RLS Policies   │
│ • Session State      │ │ • Stripe Pay  │ │ • Rate Limiting  │
│ • Session Revocation │ │ • Gemini AI   │ │ • CSRF Guards    │
└──────────────────────┘ └───────────────┘ └──────────────────┘
```

### File Responsibility Map

| File | Responsibility |
|---|---|
| `lib/ai-agent.js` | Identity, System Prompt, and "Maya" personality configuration. |
| `lib/tools.js` | Executable tool definitions with Zod validation. |
| `lib/stripe.js` | Stripe Checkout Session creation for deposit collection. |
| `lib/calendar.js` | Google Calendar API logic and per-request OAuth. |
| `lib/session.js` | JWT session creation/verification with jose. |
| `lib/revocation.js` | Session revocation store (Supabase-backed). |
| `lib/rate-limit.js` | In-memory sliding window rate limiters (chat, login, bookings). |
| `lib/pii-redact.js` | PII stripping from logs (names, phones, addresses). |
| `lib/supabase.js` | Anon client + booking creation with race condition defense. |
| `lib/supabase-admin.js` | Service role client (bypasses RLS, server-only). |
| `app/api/chat` | Core "ReAct" orchestrator — manages LLM tool-calling loops. |
| `app/api/stripe/webhook` | Payment verification with signature check + idempotency. |
| `app/api/health` | System health check (Supabase, AI, Stripe, Dashboard). |
| `middleware.js` | Dashboard auth enforcement + session revocation checks. |

---

## Installation

### 1. Clone & Install

```bash
git clone https://github.com/Ismail-2001/Mr-Cleaner-AI-Agent.git
cd Mr-Cleaner-AI-Agent
npm install
```

### 2. Environment Configuration

Copy `.env.local.example` to `.env.local` and provide your keys:

```ini
# AI Engine (Gemini primary, DeepSeek/OpenAI fallback)
GEMINI_API_KEY=your_key_here

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_ROLE_KEY=your_key

# Dashboard Auth
DASHBOARD_PASSWORD=your_password
DASHBOARD_SESSION_SECRET=random_32plus_chars

# Stripe (optional for demo)
STRIPE_SECRET_KEY=your_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret

# Integrations (optional)
GOOGLE_CALENDAR_CLIENT_ID=your_id
GOOGLE_CALENDAR_CLIENT_SECRET=your_secret
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=your_number

# Business
BUSINESS_NAME="Your Business Name"
BUSINESS_TIMEZONE=America/Chicago
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Database Initialization

Execute `supabase/schema.sql` in Supabase SQL Editor to create:
- `bookings` — Core appointment data with unique slot constraint.
- `chat_sessions` — Persistent conversation state.
- `usage_logs` — Tool execution and reasoning traces.
- `business_knowledge` — Dynamic pricing, policies, and service areas.
- `application_config` — Google Calendar OAuth tokens.

Then run `supabase/migration.sql` for seed data + performance indexes.

### 4. Run Development

```bash
npm run dev
```

Visit `http://localhost:3000` for the landing page.
Visit `http://localhost:3000/dashboard` for the owner portal.

---

## Security

### Session Management
- JWT-based session cookies via `jose` (HS256).
- 8-hour expiry with server-side revocation on logout.
- Dashboard login rate-limited to 5 attempts per 15 minutes per IP.

### Data Protection
- Supabase RLS policies restrict anon key to INSERT-only on bookings.
- Service role key used only in server-side API routes.
- All customer PII redacted from application logs.

### API Security
- Zod validation on all request bodies (chat, booking, auth).
- Rate limiting per session (chat) and per IP (login, bookings).
- CSRF protection via Origin/Referer header checks.
- Security headers: CSP, HSTS, X-Frame-Options, nosniff.

### Payment Security
- Stripe Checkout Sessions created server-side only.
- Webhook signature verification prevents spoofed payments.
- Idempotent processing prevents duplicate bookings.

---

## Roadmap

### Phase 1: Production Foundation (Complete)
- [x] Multi-model orchestration (Gemini primary, DeepSeek/OpenAI fallback)
- [x] ReAct tool-calling loop with Zod validation
- [x] Stripe payment integration (Checkout + Webhook)
- [x] Google Calendar sync with per-request OAuth
- [x] JWT session auth with revocation
- [x] Rate limiting (chat, login, bookings)
- [x] PII redaction in logs
- [x] Security headers (CSP, HSTS, X-Frame-Options)
- [x] Premium landing page with scroll animations
- [x] Owner dashboard with real-time KPIs

### Phase 2: Multi-Tenancy (Next)
- [ ] `businesses` table with per-tenant config
- [ ] Dynamic system prompt templating from DB
- [ ] Per-tenant Twilio number + Calendar OAuth
- [ ] No-code onboarding wizard
- [ ] Redis-based rate limiting for serverless scale

### Phase 3: Enterprise Scale
- [ ] Native photo storage (Supabase Storage)
- [ ] Multi-vehicle booking support
- [ ] Real weather API integration
- [ ] Subscription billing via Stripe
- [ ] Multi-location support

---

## Contributing

1. Fork the repo.
2. Create your feature branch (`git checkout -b feature/improvement`).
3. Commit with [Conventional Commits](https://www.conventionalcommits.org/).
4. Open a Pull Request.

---

<div align="center">

**Built for the elite. Perfected by Maya.**

*If this platform helps your business grow, star the repository.*

Built with by [Ismail Sajid](https://github.com/Ismail-2001)

</div>
