-- Re-apply the entitlement-gated result RPC (+ its percentile helper).
--
-- Symptom this fixes: the dashboard shows a "Tier 2" badge (so the entitlement
-- row exists) but /results/[id] still renders Tier 1 — because the deployed
-- get_attempt_result was an older version that did not compute the tier from
-- public.entitlements. CREATE OR REPLACE is idempotent and safe to re-run.

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

grant execute on function public.get_attempt_result(uuid)      to authenticated;
grant execute on function public.percentile_for(uuid, numeric) to authenticated;
