-- ExamCert Platform — Sub-project #1: Data layer
-- Migration 0001 — schema (extensions, enums, tables, indexes, triggers)
-- Target: Supabase Postgres (15+). Apply 0001 then 0002 (RLS).
-- Idempotent: safe to re-run.

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ============================ enums ============================
do $$ begin create type user_role      as enum ('student','admin'); exception when duplicate_object then null; end $$;
do $$ begin create type content_status as enum ('draft','review','published','archived'); exception when duplicate_object then null; end $$;
do $$ begin create type question_type  as enum ('mcq','multi_select','true_false','short','long'); exception when duplicate_object then null; end $$;
do $$ begin create type attempt_state  as enum ('in_progress','submitted','grading','graded'); exception when duplicate_object then null; end $$;
do $$ begin create type job_status     as enum ('queued','running','done','error'); exception when duplicate_object then null; end $$;

-- ===================== updated_at helper =======================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- =========================== profiles ==========================
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       user_role not null default 'student',
  full_name  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- auto-create a profile row on auth signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================== courses ===========================
create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  description text,
  status      content_status not null default 'draft',
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create or replace trigger trg_courses_updated before update on public.courses
  for each row execute function public.set_updated_at();

-- =========================== quizzes ===========================
create table if not exists public.quizzes (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.courses(id) on delete cascade,
  title            text not null,
  description      text,
  total_marks      int not null default 100,
  pass_mark        int not null default 50,
  duration_minutes int,
  max_attempts     int,                          -- null = unlimited
  result_of_record text not null default 'latest' check (result_of_record in ('latest','best')),
  randomize        boolean not null default false,
  status           content_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_quizzes_course on public.quizzes(course_id);
create or replace trigger trg_quizzes_updated before update on public.quizzes
  for each row execute function public.set_updated_at();

-- ==================== questions (item bank) ====================
-- Renderable fields ONLY. Answer key lives in question_keys.
create table if not exists public.questions (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses(id) on delete cascade,
  section_no    int not null default 1,
  section_title text,
  type          question_type not null,
  marks         int not null default 1 check (marks > 0),
  stem          text not null,
  options       jsonb not null default '[]'::jsonb,   -- [{ "key":"A","label":"..." }]
  status        content_status not null default 'draft',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_questions_course on public.questions(course_id);
create index if not exists idx_questions_status on public.questions(status);
create or replace trigger trg_questions_updated before update on public.questions
  for each row execute function public.set_updated_at();

-- ============ question_keys (SENSITIVE: never student-readable) ============
create table if not exists public.question_keys (
  question_id    uuid primary key references public.questions(id) on delete cascade,
  correct_answer jsonb,        -- "B" | ["A","C"] | true
  model_answer   text,
  rubric         jsonb,        -- [{ "points":2,"criterion":"..." }]
  anchors        jsonb,        -- [{ "score":7,"exemplar":"..." }]  (anchored grading)
  updated_at     timestamptz not null default now()
);
create or replace trigger trg_question_keys_updated before update on public.question_keys
  for each row execute function public.set_updated_at();

-- ===================== quiz_slots (assembly) ===================
create table if not exists public.quiz_slots (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.quizzes(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  slot_no     int not null,
  section_no  int,
  unique (quiz_id, slot_no),
  unique (quiz_id, question_id)
);
create index if not exists idx_quiz_slots_quiz on public.quiz_slots(quiz_id);

-- =========================== attempts ==========================
create table if not exists public.attempts (
  id               uuid primary key default gen_random_uuid(),
  quiz_id          uuid not null references public.quizzes(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  attempt_no       int not null default 1,
  state            attempt_state not null default 'in_progress',
  current_section  int default 1,
  started_at       timestamptz not null default now(),
  submitted_at     timestamptz,
  graded_at        timestamptz,
  score            numeric(6,2),
  max_score        numeric(6,2),
  passed           boolean,
  performance_band text,
  candidate_code   text unique,            -- public candidate id, minted at submit
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (quiz_id, user_id, attempt_no)
);
create index if not exists idx_attempts_user on public.attempts(user_id);
create index if not exists idx_attempts_quiz_state on public.attempts(quiz_id, state);
create or replace trigger trg_attempts_updated before update on public.attempts
  for each row execute function public.set_updated_at();

-- ================ attempt_answers (autosave) ===================
create table if not exists public.attempt_answers (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  answer      jsonb,                  -- "B" | ["A","C"] | { "text":"..." }
  updated_at  timestamptz not null default now(),
  unique (attempt_id, question_id)
);
create index if not exists idx_answers_attempt on public.attempt_answers(attempt_id);
create or replace trigger trg_answers_updated before update on public.attempt_answers
  for each row execute function public.set_updated_at();

-- ============ attempt_grades (admin/service only) ==============
create table if not exists public.attempt_grades (
  id               uuid primary key default gen_random_uuid(),
  attempt_id       uuid not null references public.attempts(id) on delete cascade,
  question_id      uuid not null references public.questions(id) on delete cascade,
  awarded_marks    numeric(5,2) not null default 0,
  max_marks        numeric(5,2) not null,
  rationale        text,
  self_consistency numeric(4,3),       -- 0..1 agreement across samples
  needs_review     boolean not null default false,
  grader_model     text,
  created_at       timestamptz not null default now(),
  unique (attempt_id, question_id)
);
create index if not exists idx_grades_attempt on public.attempt_grades(attempt_id);
create index if not exists idx_grades_review  on public.attempt_grades(needs_review) where needs_review;

-- ============== entitlements (Stripe; idempotent) ==============
create table if not exists public.entitlements (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  attempt_id        uuid not null references public.attempts(id) on delete cascade,
  tier              int not null check (tier in (2,3,4)),
  source            text not null default 'stripe',
  stripe_event_id   text unique,         -- webhook idempotency key
  stripe_session_id text,
  amount_cents      int,
  currency          text,
  created_at        timestamptz not null default now(),
  unique (attempt_id, tier)
);
create index if not exists idx_entitlements_user on public.entitlements(user_id);

-- ============= certificates (signed; pass-gated) ===============
create table if not exists public.certificates (
  id             uuid primary key default gen_random_uuid(),
  attempt_id     uuid not null unique references public.attempts(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  course_id      uuid not null references public.courses(id) on delete cascade,
  serial         text unique not null,
  verify_id      text unique not null,    -- opaque id embedded in QR / verify URL
  issued_at      timestamptz not null default now(),
  revoked        boolean not null default false,
  revoked_reason text,
  signature      text,                    -- JWS / Verifiable Credential proof
  pdf_url        text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_certificates_user on public.certificates(user_id);

-- =============== cohort_stats (real percentile) ================
create table if not exists public.cohort_stats (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null unique references public.quizzes(id) on delete cascade,
  computed_at  timestamptz not null default now(),
  n            int not null default 0,
  mean         numeric(6,2),
  stddev       numeric(6,2),
  distribution jsonb                       -- [{ "bucket":"0-9","count":3 }, ...]
);

-- ================= jobs (async queue for n8n) ==================
create table if not exists public.jobs (
  id              uuid primary key default gen_random_uuid(),
  type            text not null,           -- grade_attempt | issue_certificate | fulfil_payment | generate_items | send_email
  payload         jsonb not null default '{}'::jsonb,
  status          job_status not null default 'queued',
  attempts        int not null default 0,
  max_attempts    int not null default 5,
  run_after       timestamptz not null default now(),
  locked_at       timestamptz,
  last_error      text,
  idempotency_key text unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_jobs_pending on public.jobs(status, run_after);
create or replace trigger trg_jobs_updated before update on public.jobs
  for each row execute function public.set_updated_at();
