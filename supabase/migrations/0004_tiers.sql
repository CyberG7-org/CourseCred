-- 0004_tiers.sql
-- Reveal flag for the result: set once the result email has been handed off.
-- The candidate + admin portals show the result only after this is set.
alter table public.attempts
  add column if not exists result_sent_at timestamptz;

-- entitlements (tier 2/3/4) + get_attempt_result() already exist from 0001/0002.
-- Tier 1 stays "pass/fail only" by display-gating the score in the UI.
