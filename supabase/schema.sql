-- MR. CLEANER MOBILE DETAILING - DATABASE SCHEMA
-- 
-- SECURITY MODEL:
--   - Service role (supabase-admin.js) bypasses RLS entirely — used in API routes
--   - Anon key (supabase.js) is restricted to INSERT-only on specific tables
--   - Dashboard reads go through server-side API routes with session auth

-- Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  vehicle_type TEXT NOT NULL, -- sedan, SUV, truck, large SUV
  service TEXT NOT NULL,      -- Basic Wash & Wax, Premium Detail, Full Detailing
  service_price DECIMAL(10,2) NOT NULL,
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL, -- 08:00:00, 11:00:00, 14:00:00
  address TEXT,
  zip_code TEXT,
  status TEXT DEFAULT 'pending', -- pending, confirmed, cancelled, completed
  google_event_id TEXT,
  sms_sent BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RACE CONDITION FIX: Unique constraint prevents two bookings at the same time slot.
-- Without this, concurrent requests can both succeed in inserting into the same slot,
-- causing a double-book. The database is the last line of defense.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_slot
  ON bookings (booking_date, booking_time)
  WHERE status != 'cancelled';

-- Enable Row Level Security (RLS)
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- SECURITY FIX: Anon key can ONLY insert bookings (from the chat flow).
-- It cannot read bookings — that would leak customer PII to anyone with the
-- anon key. Reads are handled by the service role in API routes.
CREATE POLICY "Anon can insert bookings" ON bookings
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Service role bypasses RLS entirely, but we add this policy as a safety net
-- in case someone accidentally uses the anon key for reads.
-- The dashboard GET /api/bookings now uses supabaseAdmin (service role).

-- BOOKING DATA PERSISTENCE: Stores in-progress booking state and message
-- history per chat session.
CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id TEXT PRIMARY KEY,
  customer_data JSONB,
  message_history JSONB,
  last_active TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- SECURITY FIX: The old policy used `FOR ALL USING (true)` which meant the anon
-- key (public, bundled in client-side JS) could SELECT every customer's conversation
-- history, booking data, phone numbers, and addresses. This is a full PII data breach.
-- Now anon can only: (1) INSERT new sessions, (2) UPDATE their own session by matching
-- the session_id from the x-session-id header. SELECT is removed entirely — session
-- reads happen server-side via supabaseAdmin which bypasses RLS.
CREATE POLICY "Anon can insert sessions" ON chat_sessions
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update own session" ON chat_sessions
  FOR UPDATE TO anon
  USING (session_id = current_setting('request.headers', true)::json->>'x-session-id')
  WITH CHECK (session_id = current_setting('request.headers', true)::json->>'x-session-id');

-- Application configuration (Google Calendar tokens, etc.)
-- SECURITY: No anon access — tokens are sensitive. Service role only.
CREATE TABLE IF NOT EXISTS application_config (
  id TEXT PRIMARY KEY,
  data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE application_config ENABLE ROW LEVEL SECURITY;

-- No policies for anon = anon cannot access application_config at all.
-- Service role bypasses RLS.

-- Usage logs for debugging and analytics
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT,
  event_type TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- SECURITY FIX: Anon can only INSERT logs (for chat flow analytics).
-- Cannot read logs — that would expose system internals.
CREATE POLICY "Anon can insert logs" ON usage_logs
  FOR INSERT
  TO anon
  WITH CHECK (true);
