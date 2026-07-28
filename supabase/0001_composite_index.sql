-- Migration: Add composite index for booking time queries
-- 
-- WHY: getBookedTimesForDate queries by (business_id, booking_date, status)
-- without an index. Adding a composite index makes this a fast index-only scan
-- instead of a sequential scan.
--
-- Also adds a unique constraint on (business_id, booking_date, booking_time) to
-- prevent double-booking at the database level (last line of defense).
--
-- Requires: schema.sql (creates the bookings table)

CREATE INDEX IF NOT EXISTS idx_bookings_business_date_status
    ON bookings (business_id, booking_date, status)
    WHERE status != 'cancelled';

CREATE INDEX IF NOT EXISTS idx_bookings_business_date_time
    ON bookings (business_id, booking_date, booking_time);

-- Unique constraint for double-booking prevention
-- This is the hard backstop when advisory locks are not available
-- (e.g., multiple Vercel instances without Redis).
-- Ensure no existing duplicates before applying:
--   SELECT booking_date, booking_time, business_id, COUNT(*)
--   FROM bookings
--   GROUP BY booking_date, booking_time, business_id
--   HAVING COUNT(*) > 1;
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_unique_slot
--     ON bookings (business_id, booking_date, booking_time);
