# Known Issues & Production Readiness

*Transparent list of every limitation, required setup step, and post-deploy item.*

---

## 1. Production Checklist (Client Must Complete)

| # | Item | Owner | Time | How |
|---|------|-------|------|-----|
| 1 | **Supabase project** | Client | 5 min | Create at supabase.com, run migrations |
| 2 | **Gemini API key** | Client | 2 min | Get free key at aistudio.google.com |
| 3 | **Generate secrets** | Client | 1 min | Run `node -e "console.log(crypto.randomBytes(32).toString('hex'))"` 3 times |
| 4 | **Set env vars** | Client | 10 min | Add all required vars to Vercel dashboard |
| 5 | **Business info** | Client | 2 min | Set BUSINESS_NAME, PHONE, EMAIL, LOCATION |
| 6 | **Custom domain** | Client | varies | Add domain in Vercel, update DNS, set NEXT_PUBLIC_APP_URL |
| 7 | **Uptime monitoring** | Client | 5 min | Set up UptimeRobot on /api/health |

---

## 2. Features That Work Immediately (Zero Config)

- ✅ **AI Chat (Maya)** — Gemini primary, DeepSeek/OpenAI fallback
- ✅ **Online Booking** — calendar availability + booking creation
- ✅ **Dashboard** — bookings table, analytics, reasoning log, CSV export
- ✅ **Landing Page** — testimonials, stats, service menu, hero animations
- ✅ **Rate Limiting** — per-session + per-IP (Redis-backed when configured)
- ✅ **CSRF Protection** — Origin/Referer validation on state-changing requests
- ✅ **Input Validation** — Zod schemas on all API endpoints
- ✅ **PII Redaction** — customer names/phones redacted from all logs
- ✅ **Structured Logging** — JSON logs across all 37 source files
- ✅ **Request ID Propagation** — X-Request-Id flows through entire request lifecycle
- ✅ **API Versioning** — /api/v1/* routes available alongside /api/*
- ✅ **Compression** — gzip enabled via next.config.mjs
- ✅ **Cache Headers** — static assets immutable, health check no-cache
- ✅ **Health Check** — returns uptime, response time, version, env status
- ✅ **Environment Validation** — throws in production when critical vars missing
- ✅ **Output Validation** — LLM responses validated against Zod schema before return

---

## 3. Features Requiring Optional Env Vars

| Feature | Required Vars | Status Without |
|---------|--------------|----------------|
| **SMS Notifications** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | No SMS sent |
| **Email Fallback** | `RESEND_API_KEY` | No email sent |
| **Calendar Sync** | `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` | No Google Calendar events |
| **Weather Forecasts** | `OPENWEATHER_API_KEY` | Returns simulation data |
| **Stripe Payments** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | No Stripe (LemonSqueezy still works) |
| **Messenger/Instagram** | `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | No Meta DM responses |
| **WhatsApp Business** | `META_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` | No WhatsApp responses |
| **Google Business Profile** | `GBP_API_KEY`, `GBP_PUBSUB_VERIFICATION_TOKEN` | No GBP auto-replies |
| **Jobber CRM** | `JOBBER_CLIENT_ID`, `JOBBER_CLIENT_SECRET`, `JOBBER_WEBHOOK_SECRET` | No Jobber sync |
| **Redis Rate Limiting** | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `USE_REDIS=true` | Falls back to in-memory (not production-safe) |
| **Async Processing** | `QSTASH_TOKEN`, `CRON_SECRET` | No async webhooks, no daily summary |
| **Admin Rate-Limit Reset** | `ADMIN_API_SECRET` | Rate-limit reset endpoint returns 401 |

---

## 4. Rate Limiting

| Endpoint | Limit | Window | Storage |
|----------|-------|--------|---------|
| Chat API | 20 req/session | 1 min | Redis or in-memory |
| Chat API | 30 req/IP | 1 min | Redis or in-memory |
| Bookings POST | 5 req/IP | 1 min | Redis or in-memory |
| Dashboard Login | 5 req/IP | 15 min | Redis or in-memory |
| Webhooks | 30 req/IP | 1 min | Redis or in-memory |
| Admin Rate-Limit Reset | 5 req/IP | 5 min | Redis or in-memory |

**Production note:** Without Redis, rate limiter resets on cold start (Vercel serverless). Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` + `USE_REDIS=true` for persistent rate limiting.

---

## 5. Security Posture

| Category | Status | Notes |
|----------|--------|-------|
| RLS Policies | ✅ | All tables have Row Level Security enforced |
| Auth | ✅ | Server-side JWT auth (no client-side password check) |
| CSRF | ✅ | Origin/Referer validation on POST/PUT/DELETE |
| Rate Limiting | ✅ | Redis-backed with in-memory fallback |
| Input Validation | ✅ | Zod schemas on all API endpoints |
| Output Validation | ✅ | LLM responses validated before return |
| Session Revocation | ✅ | Logout immediately invalidates JWT |
| PII Redaction | ✅ | Customer names/phones redacted from logs |
| XSS Protection | ✅ | Content-Security-Policy headers set |
| HTTPS | ✅ | Enforced on Vercel production |
| API Keys | ✅ | No keys exposed in client bundle |
| Model Failover | ✅ | Per-request provider fallback (Gemini → DeepSeek → OpenAI) |
| Logging Resilience | ✅ | Log failures don't crash customer-facing responses |
| Prompt Injection | ✅ | First-layer canary detection in maestro.js |
| Request ID Propagation | ✅ | X-Request-Id flows through entire request lifecycle |
| Env Validation | ✅ | Throws in production when critical vars missing |

---

## 6. Technical Limitations

- **middleware.js → proxy.js migration**: Deferred — Next.js 16.1.6 does not ship `proxy.js`. Will migrate when stable Next.js 16 includes it.
- **CSP**: Uses `unsafe-inline` and `unsafe-eval` required by Next.js hydration. To remove, implement nonce-based CSP with `next/script` nonce prop.
- **Multi-Tenancy**: Single-tenant install by default. Multi-tenant architecture is deployed and functional (every query scoped by `business_id`).
- **Session Expiry**: Dashboard sessions expire after 8 hours (configurable in `lib/session.js`).
- **LemonSqueezy as Primary Payment**: Stripe is configured as fallback only. LemonSqueezy is the primary payment processor.

---

## 7. Google Calendar Setup (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID (Web application type)
3. Add redirect URI: `https://yourdomain.com/api/auth/callback/google`
4. Copy Client ID + Client Secret to env vars
5. Enable Google Calendar API in the same console

---

## 8. Post-Launch Monitoring

- **Uptime**: Set up UptimeRobot on `https://yourdomain.com/api/health` (5-min intervals)
- **Errors**: Sentry is pre-integrated — set `SENTRY_DSN` to enable
- **Logs**: Vercel dashboard → Deployments → Functions → Logs
- **Database**: Supabase dashboard → Logs → Postgres
- **Analytics**: Check dashboard weekly for booking conversion rates
- **Rate Limits**: Monitor `usage_logs` table for abuse patterns

---

## 9. Compliance

- **TCPA** — SMS consent tracked per customer (`sms_consent` field)
- **PII** — Customer data never logged in plaintext (PII redaction active)
- **PCI** — LemonSqueezy/Stripe handles all card data (never touches our servers)
- **GDPR** — Data export + deletion on request (via Supabase dashboard)
