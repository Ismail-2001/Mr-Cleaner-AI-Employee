-- WHATSAPP BUSINESS API INTEGRATION
-- Adds WhatsApp Cloud API fields to businesses table for multi-tenant WhatsApp support.
-- Run this AFTER multi-tenancy-migration.sql

-- WHATSAPP FIELDS: Meta Cloud API uses phone_number_id and whatsapp_business_account_id
-- for routing messages. These are distinct from Instagram/Messenger page IDs.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS whatsapp_business_account_id TEXT;

-- Indexes for business resolution from WhatsApp webhooks
CREATE INDEX IF NOT EXISTS idx_businesses_whatsapp_phone_number ON businesses (whatsapp_phone_number_id) WHERE whatsapp_phone_number_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_businesses_whatsapp_business_account ON businesses (whatsapp_business_account_id) WHERE whatsapp_business_account_id IS NOT NULL;

-- Track WhatsApp message IDs for idempotency (same pattern as Meta)
CREATE TABLE IF NOT EXISTS whatsapp_processed_messages (
  message_id TEXT PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_processed_created ON whatsapp_processed_messages (created_at);