-- Migration 0006: Add payment_provider column to bookings
-- WHY: LemonSqueezy webhook stores LS order IDs in the stripe_session_id column,
-- which is semantically wrong and causes confusion in refund logic. This migration
-- adds a dedicated payment_provider column to disambiguate Stripe vs LemonSqueezy.
--
-- Rollback: ALTER TABLE bookings DROP COLUMN IF EXISTS payment_provider;

-- Add payment_provider column (nullable for existing rows)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_provider text;

-- Backfill from existing data
UPDATE bookings
SET payment_provider = CASE
    WHEN notes LIKE '%LemonSqueezy%' THEN 'lemonsqueezy'
    WHEN stripe_session_id LIKE 'cs_%' THEN 'stripe'
    ELSE 'stripe'
END
WHERE payment_provider IS NULL;

-- Add index for provider-based queries
CREATE INDEX IF NOT EXISTS idx_bookings_payment_provider ON bookings(payment_provider) WHERE payment_provider IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN bookings.payment_provider IS 'Payment processor: stripe, lemonsqueezy, or null (manual/unknown)';
