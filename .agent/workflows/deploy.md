---
description: Deploy the Mr. Cleaner AI Concierge to Production
---

# 🚀 Deployment Guide: Mr. Cleaner AI Concierge

Follow these steps to move from local development to a live, revenue-generating production environment.

## Phase 1: Infrastructure Preparation

### 1. Supabase Security Audit
Ensure your database is hardened for public traffic.
- [ ] Go to the [Supabase Dashboard](https://supabase.com/dashboard).
- [ ] Verify that **Row Level Security (RLS)** is enabled on all tables: `bookings`, `usage_logs`, `application_config`, `business_knowledge`.
- [ ] Confirm that `application_config` is **Service Role Only** (no anon access).

### 2. Google Cloud Console (Production)
Update your OAuth credentials for your live domain.
- [ ] Go to [Google Cloud Console](https://console.cloud.google.com/).
- [ ] In **APIs & Services > Credentials**, find your OAuth 2.0 Client ID.
- [ ] Add your production URL to **Authorized redirect URIs**:
    - `https://your-domain.com/api/auth/callback/google`
- [ ] Update your `GOOGLE_CALENDAR_REDIRECT_URI` in your production environment variables.

---

## Phase 2: Vercel Deployment (Recommended)

### 3. Connect Repository
- [ ] Push your latest changes to GitHub: `git push origin main`.
- [ ] Create a new project in [Vercel](https://vercel.com/new).
- [ ] Import the `Mobile-Detailing-AI-Agent` repository.

### 4. Configure Environment Variables
Copy these from `.env.local` to Vercel's Environment Variables settings:
- `DEEPSEEK_API_KEY`
- `OPENAI_API_KEY` (Optional for vision)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (Required for secure config access)
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI` (Updated to production URL)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `BUSINESS_TIMEZONE`
- `DASHBOARD_PASSWORD` (Change this for production!)

---

## Phase 3: Post-Deployment initialization

### 5. Finalize Google Calendar Sync
Once the app is live at your-domain.com:
- [ ] Navigate to `https://your-domain.com/dashboard`.
- [ ] Log in with your `DASHBOARD_PASSWORD`.
- [ ] Go to the **Calendar** tab.
- [ ] Click **Connect Google Calendar**.
- [ ] Complete the OAuth flow using your business account.
- [ ] Verify connection status in the **Settings** tab.

### 6. Twilio SMS Verification
- [ ] Perform a test booking on the live site.
- [ ] Ensure the SMS arrives at the `BUSINESS_PHONE` number.
- [ ] Check the **Intelligence** feed in the dashboard to confirm the tool call was logged.

---

## 🛠 Troubleshooting
- **OAuth Error**: Double-check your Redirect URI in Google Cloud matches your domain exactly.
- **AI Timeout**: Ensure your AI API keys have sufficient credits.
- **RLS Errors**: Check Supabase logs if the dashboard fails to load bookings.
