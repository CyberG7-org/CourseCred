-- Cache the AI-written per-section analysis on the attempt so the Tier-2 report
-- generates it once (on first download) and reuses it thereafter. Optional: the
-- report route still works without this column (it just regenerates each time).
alter table public.attempts add column if not exists section_analysis jsonb;
