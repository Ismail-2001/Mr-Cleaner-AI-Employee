# KNOWN_ISSUES.md

Issues identified during the production remediation audit that are intentionally
deferred. Each should be filed as a ticket and addressed before or shortly after
client handoff.

---

## 1. ~~Supabase anon key is public and RLS policies are too permissive~~ — RESOLVED

Tightened RLS policies: anon can only INSERT bookings/chat_sessions/usage_logs.
application_config is service-role only. SELECT on bookings is service-role only.

---

## 2. ~~Chat API route has no rate limiting~~ — RESOLVED

Added in-memory sliding window rate limiter (`lib/rate-limit.js`) — 20 requests
per minute per session ID. Chat, bookings, and auth routes all enforce limits.

---

## 3. ~~Stripe webhook secret is not validated at startup~~ — RESOLVED

Added `lib/validate-env.js` that runs at API route startup. Validates all critical
env vars (DASHBOARD_PASSWORD, DASHBOARD_SESSION_SECRET, STRIPE_SECRET_KEY,
STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).

---

## 4. ~~`chat_sessions` table may not exist in Supabase~~ — RESOLVED

Added to `supabase/schema.sql` as part of Fix 4 implementation.

---

## 5. ~~Calendar availability check doesn't account for bookings table~~ — RESOLVED

Updated `lib/calendar.js` `checkAvailability` to exclude slots with non-cancelled
bookings from the Supabase bookings table.

---

## 6. No CSRF protection on booking POST endpoint

**Severity:** LOW  
**File:** `app/api/bookings/route.js`

The booking creation endpoint accepts any POST with JSON body. While the data is
validated, there's no CSRF token check. An attacker could craft a page that
submits a booking on behalf of a logged-in dashboard user.

**Recommended fix:** Add CSRF token validation for state-changing endpoints, or
ensure the booking POST is only callable from the chat interface (e.g., verify
Origin/Referer headers).

---

## 7. Weather check is simulated

**Severity:** LOW  
**File:** `lib/tools.js` (check_weather)

The weather check returns random forecasts. For a real production system, this
should call a weather API (e.g., OpenWeatherMap) with the actual date and zip code.

**Recommended fix:** Integrate OpenWeatherMap or similar API. This is a feature
enhancement, not a security fix.

---

## 8. Rate limiter is in-memory only (no persistence across restarts)

**Severity:** LOW  
**File:** `lib/rate-limit.js`

The sliding window rate limiter stores state in a JavaScript Map. If the server
restarts, all rate limit counters reset. Acceptable for single-instance deployment
but not for multi-instance or serverless.

**Recommended fix:** For multi-instance deployments, use Redis or Supabase to store
rate limit counters.

---

## 9. Error boundaries only on dashboard and chat

**Severity:** LOW  
**File:** `components/ErrorBoundary.js`

Error boundaries are only applied to the dashboard page and chat interface. Other
client components (booking summary, etc.) may throw unhandled errors in production.

**Recommended fix:** Add error boundaries around other interactive components as needed.
