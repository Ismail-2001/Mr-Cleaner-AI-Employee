-- MULTI-TENANCY MIGRATION
-- Adds businesses table and business_id foreign keys to existing tables.
-- Run this AFTER schema.sql to enable multi-tenant support.

-- BUSINESSES TABLE: Core multi-tenancy table. Each row = one detailing business.
CREATE TABLE IF NOT EXISTS businesses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,           -- URL-friendly identifier (e.g., 'mr-cleaner')
  name TEXT NOT NULL,                   -- Display name (e.g., 'Mr. Cleaner Mobile Detailing')
  owner_name TEXT,
  email TEXT,
  phone TEXT,
  timezone TEXT DEFAULT 'America/Chicago',
  location TEXT,                        -- City/State (e.g., 'Austin, TX')
  logo_url TEXT,
  branding JSONB DEFAULT '{}',          -- { primary_color, secondary_color, tagline }
  service_area JSONB DEFAULT '{}',      -- { counties: [], zip_codes: [] }
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- No anon access to businesses table. Service role only.
-- In multi-tenant mode, the API routes will filter by business_id.

-- Add business_id to existing tables (nullable for backward compatibility)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id);
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id);
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id);
ALTER TABLE business_knowledge ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id);

-- Performance indexes for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_bookings_business_id ON bookings (business_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_business_id ON chat_sessions (business_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_business_id ON usage_logs (business_id);
CREATE INDEX IF NOT EXISTS idx_business_knowledge_business_id ON business_knowledge (business_id);

-- Seed default business for backward compatibility
-- This allows existing single-tenant deployments to work without changes.
INSERT INTO businesses (id, slug, name, owner_name, phone, timezone, location, service_area)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'mr-cleaner',
  'Mr. Cleaner Mobile Detailing',
  'Owner',
  '+15550001234',
  'America/Chicago',
  'Texas',
  '{"counties": ["Travis", "Williamson", "Hays"], "zip_codes": ["78701", "78702", "78703", "78704", "78705", "78613", "78660", "78664"]}'
)
ON CONFLICT (slug) DO NOTHING;

-- Update existing business_knowledge rows to belong to default business
UPDATE business_knowledge SET business_id = '00000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
