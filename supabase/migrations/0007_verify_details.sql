-- Enrich the public certificate-verification result with the quiz, candidate id,
-- and attempt timing (joined through the attempt). Still exposes only public-safe
-- fields — no scores, answers, or grades. CREATE OR REPLACE is idempotent.
create or replace function public.verify_certificate(p_verify_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  select jsonb_build_object(
           'valid',        (not c.revoked),
           'serial',       c.serial,
           'name',         p.full_name,
           'course',       co.title,
           'quiz',         qz.title,
           'candidate_id', at.candidate_code,
           'started_at',   at.started_at,
           'submitted_at', at.submitted_at,
           'issued_at',    c.issued_at,
           'revoked',      c.revoked)
    into r
  from public.certificates c
  join public.profiles p  on p.id  = c.user_id
  join public.courses  co on co.id = c.course_id
  join public.attempts at on at.id = c.attempt_id
  join public.quizzes  qz on qz.id = at.quiz_id
  where c.verify_id = p_verify_id;

  if r is null then
    return jsonb_build_object('valid', false, 'error', 'not_found');
  end if;
  return r;
end $$;

grant execute on function public.verify_certificate(text) to anon, authenticated;
