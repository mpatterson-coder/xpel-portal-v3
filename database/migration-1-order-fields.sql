-- =============================================================================
-- Migration 1 — Customer details + pick-up date on orders (July 2026)
--
-- WHAT THIS DOES
--   Adds four new columns to the orders table:
--     customer_first_name, customer_last_name, customer_email, pickup_date
--
-- HOW TO RUN IT (on your EXISTING live V3 database)
--   Supabase -> SQL Editor -> New query -> paste this WHOLE file -> Run.
--   You should see "Success. No rows returned."
--
-- NOTES
--   * Run this BEFORE uploading the new code to GitHub. The new order form
--     saves into these columns, so they must exist first.
--   * Safe to run more than once (IF NOT EXISTS makes re-runs harmless).
--   * Existing orders are untouched. They keep their original combined
--     customer name, which every screen still displays.
--   * No security (RLS) changes are needed — new columns are automatically
--     covered by the existing row-level policies on the orders table.
-- =============================================================================

alter table orders
  add column if not exists customer_first_name text,
  add column if not exists customer_last_name  text,
  add column if not exists customer_email      text,
  add column if not exists pickup_date         date;

-- Tell Supabase's API layer to pick up the new columns immediately
-- (prevents a rare "column not found" error right after a migration).
notify pgrst, 'reload schema';
