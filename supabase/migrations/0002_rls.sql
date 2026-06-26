-- ExamCert Platform — Sub-project #1: Data layer
-- Migration 0002 — Row-Level Security, helper functions, gated RPCs.
-- The SERVICE ROLE (used by n8n) bypasses RLS. These policies govern the
-- anon / authenticated keys used by the browser frontend.
-- Run-once (policies are not guarded for re-run).

-- ===== admin check (security definer avoids RLS recursion on profiles) =====
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- prevent self-promotion: only admins may change a profile's role
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Block logged-in users from changing their own role; allow privileged
  -- backend contexts (service role / SQL editor, where auth.uid() is null)
  -- so the first admin can be bootstrapped.
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'only admins may change role';
  end if;
  return new;
end $$;
drop trigger if exists trg_profiles_guard_role on public.profiles;
create trigger trg_profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ===================== enable RLS everywhere =====================
alter table public.profiles        enable row level security;
alter table public.courses         enable row level security;
alter table public.quizzes         enable row level security;
alter table public.questions       enable row level security;
alter table public.question_keys   enable row level security;
alter table public.quiz_slots      enable row level security;
alter table public.attempts        enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.attempt_grades  enable row level security;
alter table public.entitlements    enable row level security;
alter table public.certificates    enable row level security;
alter table public.cohort_stats    enable row level security;
alter table public.jobs            enable row level security;

-- ============================ profiles ===========================
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ============================ courses ============================
create policy courses_read_published on public.courses
  for select using (status = 'published' or public.is_admin());
create policy courses_admin_write on public.courses
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================ quizzes ============================
create policy quizzes_read_published on public.quizzes
  for select using (status = 'published' or public.is_admin());
create policy quizzes_admin_write on public.quizzes
  for all using (public.is_admin()) with check (public.is_admin());

-- ===================== questions (renderable) ====================
create policy questions_read on public.questions
  for select using (status = 'published' or public.is_admin());
create policy questions_admin_write on public.questions
  for all using (public.is_admin()) with check (public.is_admin());

-- ========== question_keys: NO student policy => default deny ==========
create policy question_keys_admin_only on public.question_keys
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================ quiz_slots =========================
create policy quiz_slots_read on public.quiz_slots
  for select using (
    public.is_admin()
    or exists (select 1 from public.quizzes q where q.id = quiz_id and q.status = 'published')
  );
create policy quiz_slots_admin_write on public.quiz_slots
  for all using (public.is_admin()) with check (public.is_admin());

-- ===================== attempts (own only) =======================
create policy attempts_own_read on public.attempts
  for select using (user_id = auth.uid() or public.is_admin());
create policy attempts_own_insert on public.attempts
  for insert with check (user_id = auth.uid());
create policy attempts_own_update on public.attempts
  for update using ((user_id = auth.uid() and state = 'in_progress') or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ============= attempt_answers (own, while in progress) ==========
create policy answers_own_read on public.attempt_answers
  for select using (
    public.is_admin()
    or exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = auth.uid())
  );
create policy answers_own_write on public.attempt_answers
  for all using (
    public.is_admin()
    or exists (select 1 from public.attempts a
               where a.id = attempt_id and a.user_id = auth.uid() and a.state = 'in_progress')
  ) with check (
    public.is_admin()
    or exists (select 1 from public.attempts a
               where a.id = attempt_id and a.user_id = auth.uid() and a.state = 'in_progress')
  );

-- ===== attempt_grades: NO direct student read (served via gated RPC) =====
create policy grades_admin_only on public.attempt_grades
  for all using (public.is_admin()) with check (public.is_admin());

-- ============ entitlements (own read; writes by service role) ============
create policy entitlements_own_read on public.entitlements
  for select using (user_id = auth.uid() or public.is_admin());
create policy entitlements_admin_write on public.entitlements
  for all using (public.is_admin()) with check (public.is_admin());

-- =============== certificates (own read; public verify RPC) ==============
create policy certificates_own_read on public.certificates
  for select using (user_id = auth.uid() or public.is_admin());
create policy certificates_admin_write on public.certificates
  for all using (public.is_admin()) with check (public.is_admin());

-- ================= cohort_stats (aggregate; authed read) =================
create policy cohort_read on public.cohort_stats
  for select using (auth.role() = 'authenticated' or public.is_admin());
create policy cohort_admin_write on public.cohort_stats
  for all using (public.is_admin()) with check (public.is_admin());

-- ===================== jobs (admin/service only) ========================
create policy jobs_admin_only on public.jobs
  for all using (public.is_admin()) with check (public.is_admin());

-- ========================================================================
-- Entitlement-gated result RPC — the Tier 2/3/4 paywall is enforced HERE,
-- not by exposing attempt_grades to the browser.
-- ========================================================================
create or replace function public.percentile_for(p_quiz_id uuid, p_score numeric)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v_below int; v_total int;
begin
  select count(*) filter (where score is not null and score < p_score),
         count(*) filter (where score is not null)
    into v_below, v_total
  from public.attempts
  where quiz_id = p_quiz_id and state = 'graded';
  if coalesce(v_total,0) = 0 then return null; end if;
  return round((v_below::numeric / v_total) * 100, 1);
end $$;

create or replace function public.get_attempt_result(p_attempt_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_attempt  public.attempts;
  v_uid      uuid := auth.uid();
  v_max_tier int := 1;
  v_result   jsonb;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id;
  if not found then raise exception 'attempt not found'; end if;
  if v_attempt.user_id <> v_uid and not public.is_admin() then
    raise exception 'not authorized';
  end if;

  -- highest purchased tier for this attempt (free = 1)
  select coalesce(max(tier), 1) into v_max_tier
  from public.entitlements where attempt_id = p_attempt_id;

  -- TIER 1 (free): overall outcome
  v_result := jsonb_build_object(
    'attempt_id', v_attempt.id,
    'state',      v_attempt.state,
    'score',      v_attempt.score,
    'max_score',  v_attempt.max_score,
    'passed',     v_attempt.passed,
    'tier',       v_max_tier
  );

  -- TIER 2+: per-section breakdown
  if v_max_tier >= 2 then
    v_result := v_result || jsonb_build_object('sections', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'section_no', q.section_no,
               'awarded',    sum(g.awarded_marks),
               'max',        sum(g.max_marks)) order by q.section_no), '[]'::jsonb)
      from public.attempt_grades g
      join public.questions q on q.id = g.question_id
      where g.attempt_id = p_attempt_id
      group by q.section_no));
  end if;

  -- TIER 3+: real percentile vs cohort
  if v_max_tier >= 3 then
    v_result := v_result || jsonb_build_object(
      'percentile', public.percentile_for(v_attempt.quiz_id, v_attempt.score));
  end if;

  -- TIER 4: full per-question diagnostic
  if v_max_tier >= 4 then
    v_result := v_result || jsonb_build_object('questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'question_id', g.question_id,
               'awarded',     g.awarded_marks,
               'max',         g.max_marks,
               'rationale',   g.rationale)), '[]'::jsonb)
      from public.attempt_grades g where g.attempt_id = p_attempt_id));
  end if;

  return v_result;
end $$;

-- ========================================================================
-- Public certificate verification — replaces the Google-Sheet lookup.
-- Anon-callable; exposes only minimal, public-safe fields.
-- ========================================================================
create or replace function public.verify_certificate(p_verify_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  select jsonb_build_object(
           'valid',     (not c.revoked),
           'serial',    c.serial,
           'name',      p.full_name,
           'course',    co.title,
           'issued_at', c.issued_at,
           'revoked',   c.revoked)
    into r
  from public.certificates c
  join public.profiles p  on p.id  = c.user_id
  join public.courses  co on co.id = c.course_id
  where c.verify_id = p_verify_id;

  if r is null then
    return jsonb_build_object('valid', false, 'error', 'not_found');
  end if;
  return r;
end $$;

-- function execution grants
grant execute on function public.verify_certificate(text)        to anon, authenticated;
grant execute on function public.get_attempt_result(uuid)        to authenticated;
grant execute on function public.percentile_for(uuid, numeric)   to authenticated;
