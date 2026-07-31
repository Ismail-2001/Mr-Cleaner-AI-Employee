-- Add landing_config JSONB column for per-business landing page customization.
-- Businesses can store overrides for hero, stats, testimonials, and footer content.
-- If NULL, the app uses hardcoded defaults (backward compatible).

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS landing_config JSONB;

-- Also add default_deposit_amount for L6 (configurable deposit per business)
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS default_deposit_amount INTEGER DEFAULT 50;

INSERT INTO _migrations (name, checksum) VALUES ('0003_landing_config', 'manual')
ON CONFLICT (name) DO NOTHING;
