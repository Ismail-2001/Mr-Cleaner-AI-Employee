# Production Deployment Guide

*Expert engineering checklist for deploying Maya AI Concierge to production.*

---

## Prerequisites

- [ ] Node.js 20.x installed
- [ ] Vercel account ([vercel.com](https://vercel.com))
- [ ] Supabase project ([supabase.com](https://supabase.com))
- [ ] Gemini API key ([aistudio.google.com](https://aistudio.google.com))
- [ ] GitHub repo connected to Vercel

---

## Step 1: Generate Secrets

Run these locally to generate secure random values:

```bash
# Admin API secret (for rate-limit reset endpoint)
node -e "console.log(crypto.randomBytes(32).toString('hex'))"

# Dashboard session secret (JWT signing key)
node -e "console.log(crypto.randomBytes(32).toString('hex'))"

# Cron secret (health check + daily summary auth)
node -e "console.log(crypto.randomBytes(32).toString('hex'))"
```

Save these values — you'll need them in Step 4.

---

## Step 2: Initialize Database

In Supabase SQL Editor, run all migrations in order:

```sql
-- 1. Base schema
\i supabase/schema.sql

-- 2. Multi-tenancy
\i supabase/multi-tenancy-migration.sql

-- 3. Vehicle photos
\i supabase/vehicle-photos-migration.sql

-- 4. WhatsApp fields
\i supabase/0004_whatsapp_integration.sql

-- 5. Loyalty program
\i supabase/0005_loyalty_program.sql
```

Or paste each file's contents directly into the SQL Editor.

**Verify:** Run `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';` — you should see `bookings`, `customers`, `usage_logs`, `loyalty_accounts`, `loyalty_transactions`, and others.

---

## Step 3: Deploy to Vercel

```bash
# Install Vercel CLI (if not already)
npm install -g vercel

# Login
vercel login

# Deploy to production
vercel --prod
```

When prompted:
```
? Set up and deploy? → Y
? Which scope? → Select your account
? Link to existing project? → N (first time) or Y (re-deploy)
? Project name? → mr-cleaner
? Directory is empty? → N
? Override settings? → N
```

Note the deployment URL (e.g., `https://mr-cleaner-xyz.vercel.app`).

---

## Step 4: Set Environment Variables

In Vercel dashboard → Settings → Environment Variables, add:

### Required (copy from your `.env.local`)

| Variable | Value | Notes |
|----------|-------|-------|
| `DASHBOARD_PASSWORD` | Your chosen password | Used to log into `/dashboard` |
| `DASHBOARD_SESSION_SECRET` | 64-char hex string | Generated in Step 1 |
| `ADMIN_API_SECRET` | 64-char hex string | Generated in Step 1 — separate from session secret |
| `CRON_SECRET` | 64-char hex string | Generated in Step 1 — for health check + cron auth |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` | From Supabase dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_xxx` | From Supabase dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_xxx` | From Supabase dashboard → Settings → API (never expose to client) |
| `GEMINI_API_KEY` | `AQ.Ab8RN6...` | From aistudio.google.com |
| `NEXT_PUBLIC_APP_URL` | `https://mr-cleaner-xyz.vercel.app` | Your Vercel deployment URL |
| `NODE_ENV` | `production` | Enables strict env validation + security headers |

### Payment (LemonSqueezy — primary)

| Variable | Value |
|----------|-------|
| `LEMONSQUEEZY_API_KEY` | From LemonSqueezy dashboard → Settings → API |
| `LEMONSQUEEZY_STORE_ID` | Your store ID |
| `LEMONSQUEEZY_VARIANT_ID` | Your variant ID |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | From LemonSqueezy webhook settings |

### Business Info (required for chat prompt + responses)

| Variable | Value |
|----------|-------|
| `BUSINESS_NAME` | Your business name |
| `BUSINESS_PHONE` | Your business phone (+1XXXXXXXXXX) |
| `BUSINESS_EMAIL` | Your business email |
| `BUSINESS_LOCATION` | City, State |
| `BUSINESS_TIMEZONE` | `America/Chicago` (or your timezone) |

### Security

| Variable | Value |
|----------|-------|
| `ENCRYPTION_KEY` | 64-char hex string — for PII at rest |

**Click "Save" after each variable.**

---

## Step 5: Redeploy

After setting all env vars:

```bash
vercel --prod
```

Or click "Redeploy" in Vercel dashboard. This ensures the new env vars are picked up.

---

## Step 6: Verify Deployment

### 6a. Health Check

```bash
curl https://mr-cleaner-xyz.vercel.app/api/health
```

Expected response:
```json
{
  "status": "ok",
  "uptime_sec": 12345,
  "response_time_ms": 45,
  "version": "1.0.0",
  "env": "production"
}
```

### 6b. Chat Test

```bash
curl -X POST https://mr-cleaner-xyz.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hi, I need a ceramic coating quote", "session_id": "test-001"}'
```

Expected: JSON with Maya's response (not simulation mode).

### 6c. Dashboard

Open `https://mr-cleaner-xyz.vercel.app/dashboard` in browser.
- Login with your `DASHBOARD_PASSWORD`
- Verify bookings table loads
- Verify analytics section shows data

### 6d. Versioned API

```bash
curl https://mr-cleaner-xyz.vercel.app/api/v1/health
```

Should return same health response.

---

## Step 7: Configure Webhooks

After deployment, set up webhooks for each integration:

### LemonSqueezy Webhook
- URL: `https://mr-cleaner-xyz.vercel.app/api/lemonsqueezy/webhook`
- Events: `order_created`, `order_updated`

### Stripe Webhook (if using Stripe fallback)
- URL: `https://mr-cleaner-xyz.vercel.app/api/webhook/stripe`
- Events: `checkout.session.completed`, `charge.refunded`

### Meta Messenger Webhook (if using Messenger/Instagram)
- URL: `https://mr-cleaner-xyz.vercel.app/api/webhook/meta`
- Verify Token: Your `META_WEBHOOK_VERIFY_TOKEN`

### Jobber Webhook (if using Jobber CRM)
- URL: `https://mr-cleaner-xyz.vercel.app/api/integrations/jobber`

### Google Business Profile (if using GBP)
- URL: `https://mr-cleaner-xyz.vercel.app/api/webhook/google`

### QStash (if using async processing)
- Set `QSTASH_TOKEN` in Vercel env vars
- Update Upstash dashboard with webhook URLs

---

## Step 8: Custom Domain (Optional)

1. Vercel → Settings → Domains → Add Domain
2. Enter your domain (e.g., `mrcleaner.com`)
3. Follow Vercel's DNS instructions:
   - Add CNAME record pointing to `cname.vercel-dns.com`
   - Or add A record pointing to `76.76.21.21`
4. Wait for SSL certificate (automatic, ~2 min)
5. Update `NEXT_PUBLIC_APP_URL` to `https://mrcleaner.com`
6. Redeploy

---

## Step 9: Post-Deploy Monitoring

### Uptime Monitoring

Set up [UptimeRobot](https://uptimerobot.com) (free):
- Monitor URL: `https://mr-cleaner-xyz.vercel.app/api/health`
- Check interval: 5 minutes
- Alert via email + SMS

### Error Tracking

Sentry is already integrated. To enable:
1. Create account at [sentry.io](https://sentry.io)
2. Create new Next.js project
3. Copy DSN to env var `SENTRY_DSN`
4. Redeploy

### Log Monitoring

- Vercel dashboard → Deployments → Functions → Logs
- Supabase dashboard → Logs → Postgres

---

## Optional Integrations

Add these after core deployment is verified:

### Twilio (SMS Notifications)
```
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1507xxxxxxx
```

### Google Calendar (Booking Sync)
```
GOOGLE_CALENDAR_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CALENDAR_CLIENT_SECRET=GOCSPX-xxxxx
GOOGLE_CALENDAR_REDIRECT_URI=https://mr-cleaner-xyz.vercel.app/api/auth/callback/google
```

### Resend (Email Fallback)
```
RESEND_API_KEY=re_xxxxx
```

### OpenWeather (Weather Forecasts)
```
OPENWEATHER_API_KEY=xxxxx
```

### WhatsApp Business
```
META_ACCESS_TOKEN=EAAxxxxx
WHATSAPP_PHONE_NUMBER_ID=xxxxx
WHATSAPP_BUSINESS_ACCOUNT_ID=xxxxx
```

### Upstash Redis (Production Rate Limiting)
```
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxx
USE_REDIS=true
```

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `500 Function has timed out` | Gemini API slow | Check `GEMINI_API_KEY`, retry |
| `Module not found` | Deps not installed | Run `npm install` locally, redeploy |
| `Server configuration error` | Missing env vars | Check Vercel env vars |
| `Simulation mode` response | No AI keys set | Add `GEMINI_API_KEY` |
| `401 Unauthorized` on dashboard | Wrong password or missing `DASHBOARD_SESSION_SECRET` | Verify both are set |
| `Rate limit exceeded` | Redis not configured | Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, set `USE_REDIS=true` |
| Health check returns 503 | DB connection failing | Check `SUPABASE_SERVICE_ROLE_KEY` |

---

## Deployment Checklist Summary

```
□ Step 1: Generate 3 secrets (ADMIN_API_SECRET, DASHBOARD_SESSION_SECRET, CRON_SECRET)
□ Step 2: Run all 5 SQL migrations in Supabase
□ Step 3: Deploy to Vercel with `vercel --prod`
□ Step 4: Set 20+ env vars in Vercel dashboard
□ Step 5: Redeploy to pick up env vars
□ Step 6: Verify health check, chat, dashboard, versioned API
□ Step 7: Configure webhooks for each integration
□ Step 8: (Optional) Add custom domain
□ Step 9: Set up uptime monitoring + Sentry
□ Step 10: (Optional) Add Twilio, Google Calendar, Redis, WhatsApp
```

**Estimated time: 30-45 minutes for core deployment, +15 min per optional integration.**
