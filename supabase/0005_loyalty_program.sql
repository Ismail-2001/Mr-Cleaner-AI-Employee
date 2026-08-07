-- LOYALTY PROGRAM
-- Adds loyalty points tracking to bookings and customers.

-- Add loyalty points to bookings (earned per service)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS loyalty_points_earned INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS loyalty_discount_amount DECIMAL(10,2) DEFAULT 0;

-- Customer loyalty tracking table
CREATE TABLE IF NOT EXISTS customer_loyalty (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  total_points INTEGER DEFAULT 0,
  lifetime_points INTEGER DEFAULT 0,
  tier TEXT DEFAULT 'bronze',  -- bronze, silver, gold, platinum
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, customer_phone)
);

ALTER TABLE customer_loyalty ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_customer_loyalty_business ON customer_loyalty (business_id);
CREATE INDEX IF NOT EXISTS idx_customer_loyalty_phone ON customer_loyalty (business_id, customer_phone);

-- Points earning rules (configurable per business)
-- Default: 1 point per $1 spent, tier bonuses
CREATE TABLE IF NOT EXISTS loyalty_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) NOT NULL,
  points_per_dollar INTEGER DEFAULT 1,
  tier_thresholds JSONB DEFAULT '{"silver": 100, "gold": 500, "platinum": 1000}',
  tier_multipliers JSONB DEFAULT '{"bronze": 1, "silver": 1.25, "gold": 1.5, "platinum": 2}',
  redemption_rate DECIMAL(5,2) DEFAULT 0.01,  -- 1 point = $0.01 discount
  min_redemption INTEGER DEFAULT 50,           -- Minimum points to redeem
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id)
);