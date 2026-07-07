# Mr. Cleaner — Demo Guide

Step-by-step script for demonstrating the AI-powered mobile detailing platform.

---

## Quick Start (2 minutes)

```bash
# 1. Install dependencies (if not done)
npm install

# 2. Start the dev server
npm run dev

# 3. Open in browser
# Landing page: http://localhost:3000
# Dashboard:    http://localhost:3000/dashboard
```

**Dashboard login password:** `demo2026`

---

## What Works in Demo Mode (No API Keys)

| Feature | Status | Notes |
|---------|--------|-------|
| Landing page | ✅ Full | Glassmorphism UI, all sections render |
| Chat with Maya | ✅ Simulation | Maya responds with mock data |
| Service menu | ✅ Full | Clicking services opens chat |
| Dashboard | ✅ Full | Login works, UI renders |
| Pricing quotes | ✅ Fallback | Uses hardcoded Texas pricing |
| Availability check | ✅ Mock | Returns sample time slots |
| SMS alerts | ✅ Simulated | Logged to console, not sent |
| Payment links | ✅ Mock | Shows demo URL, no real charge |
| Calendar sync | ❌ Disabled | Needs Google OAuth keys |

---

## Demo Script (5 minutes)

### Part 1: The Landing Page (30 seconds)

**Say:** "This is Mr. Cleaner — a premium AI-powered booking platform for luxury mobile detailing in Texas."

**Show:**
1. Scroll through the landing page — hero section, vision showcase, service menu
2. Point out the luxury branding (glassmorphism, gold accents, dark theme)
3. Click "Book Now" or any service to open the AI chat

### Part 2: Maya the AI Concierge (2 minutes)

**Say:** "Meet Maya — our AI concierge. She handles the entire booking flow autonomously."

**Demo conversation:**
```
You:    "Hi, I need my car detailed"
Maya:   Asks for zip code (verifies service area)
You:    "78701"
Maya:   Confirms area, asks about vehicle
You:    "It's a sedan, pretty dirty"
Maya:   Asks about condition (pet hair, heavily soiled?)
You:    "Standard condition"
Maya:   Calculates quote using pricing tool
You:    "That works, what times are available?"
Maya:   Checks availability (returns mock slots)
You:    "Tomorrow at 10 AM works"
Maya:   Collects name, phone, address
You:    "John Smith, 555-123-4567, 123 Main St"
Maya:   Generates deposit link ($50)
```

**Point out:** Maya uses tools autonomously — pricing, availability, booking state sync.

### Part 3: The Dashboard (1.5 minutes)

**Say:** "The owner portal shows real-time business intelligence."

1. Go to `http://localhost:3000/dashboard`
2. Login with password: `demo2026`
3. Show:
   - Revenue stats (projected ROI)
   - Lead conversion funnel
   - Recent bookings list
   - Business knowledge editor

**Say:** "Everything Maya does is tracked here — every tool call, every decision."

### Part 4: Technical Architecture (1 minute)

**Say:** "Under the hood, this is a production-grade system."

**Key points:**
- **ReAct Loop:** Maya iterates up to 5 times, calling tools before responding
- **Zod Validation:** Every tool call is schema-validated (no hallucinated pricing)
- **Race Condition Protection:** Database-level unique constraints prevent double-booking
- **Session Persistence:** Customer data survives page refreshes via Supabase
- **Webhook-first Payments:** Stripe webhooks are the source of truth (not client redirects)

---

## If You Have API Keys (Full Demo)

To show the FULL experience with real AI responses:

1. Get a DeepSeek API key (cheap, ~$0.01 per conversation): https://platform.deepseek.com
2. Add to `.env.local`:
   ```
   DEEPSEEK_API_KEY=your_key_here
   ```
3. Restart the dev server

Now Maya will use real AI reasoning instead of mock responses.

---

## Troubleshooting

**SWC/WASM error on Windows:**
```
Error: `turbo.createProject` is not supported by the wasm bindings.
```
This is a known Next.js 16 issue on some Windows machines. Fix:
```bash
npm install @next/swc-win32-x64-msvc
npm run dev
```
Or use WSL2 / a Mac for the demo.

**"Module not found" errors:**
```bash
npm install
```

**Port 3000 already in use:**
```bash
npx next dev -p 3001
```

**Dashboard login fails:**
- Check `.env.local` has `DASHBOARD_PASSWORD=demo2026`
- Check `DASHBOARD_SESSION_SECRET` is set (32+ chars)

**Chat doesn't respond:**
- Without API keys, Maya returns a simulation message
- This is expected — the chat still works, just uses mock data

---

## Key Talking Points for Investors/Clients

1. **"Maya doesn't just chat — she orchestrates."** Tool-calling loop, not a simple chatbot.
2. **"Production-grade security."** Rate limiting, input validation, race condition protection.
3. **"Revenue intelligence."** Dashboard tracks every lead, every dollar.
4. **"Works without AI keys."** Graceful fallbacks mean the demo always works.
5. **"Built for scale."** Supabase + Next.js architecture handles growth.

---

## Files to Show (If Technical Audience)

| File | What It Does |
|------|--------------|
| `lib/ai-agent.js` | Maya's personality and protocols |
| `lib/tools.js` | Tool definitions with Zod schemas |
| `app/api/chat/route.js` | The ReAct orchestration loop |
| `lib/supabase.js` | Data layer with fallbacks |
| `lib/session.js` | JWT auth for dashboard |
| `middleware.js` | Route protection |
| `components/ChatInterface.js` | Persistent session UI |
| `app/dashboard/page.js` | Owner intelligence portal |
