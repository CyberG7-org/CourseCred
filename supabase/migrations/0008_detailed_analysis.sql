alter table public.attempts
add column if not exists detailed_analysis jsonb;
