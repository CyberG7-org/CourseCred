# ExamCert — Project Handover

AI-graded exam & certification platform (Coursera/Kahoot-style). Admins generate quizzes with AI; candidates take them; answers are auto-graded; results/certificates are delivered (email + paid tiers — see *Pending*).

---

## 1. Live & access

| What | Where |
|---|---|
| Live site | https://examcert-web.vercel.app |
| Admin console | https://examcert-web.vercel.app/admin |
| GitHub repo | `CyberG7-org/Exam-Platform` (private) |
| Local clone | `C:\Users\cyber\examcert-web` (branch `master`) |
| Supabase project | `ysxbemvuhljslfftcvev` |
| Vercel | scope `cyberg7`, project `examcert-web` |

**Admin accounts** are normal users with `profiles.role = 'admin'`. To promote a user, run in the Supabase SQL editor:
```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

---

## 2. Tech stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind v4** (CSS-first `@theme` in `src/app/globals.css` — no config file)
- **Supabase**: Postgres + Auth + RLS (`@supabase/ssr`, `@supabase/supabase-js`)
- **Anthropic SDK** (`@anthropic-ai/sdk`), model **`claude-opus-4-8`**, structured outputs
- **mammoth** (DOCX → text for the knowledge-base upload)
- Hosting: **Vercel** (deployed via CLI, *not* git-linked)

---

## 3. Environment variables

Set in **Vercel → Settings → Environment Variables** *and* in local `.env.local` (gitignored).

| Var | Type | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | `https://ysxbemvuhljslfftcvev.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | publishable key — safe to expose |
| `ANTHROPIC_API_KEY` | **secret** | server-only; needed for generation + grading |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | server-only; grader + admin Results read (bypasses RLS) |

> The two secrets are never committed. `.env.local` stays gitignored. If a secret leaks, rotate it in the provider dashboard.

---

## 4. Run & deploy

```bash
# install
npm install

# local dev (needs .env.local with all 4 vars)
npm run dev            # http://localhost:3000

# production build
npm run build

# deploy to Vercel production
npx vercel deploy --prod --cwd .
```

Vercel is **not** connected to git, so pushing to GitHub does **not** auto-deploy — run the deploy command above (or connect the repo in Vercel → Settings → Git for push-to-deploy).

---

## 5. Database (Supabase)

Migrations live in `supabase/migrations/` and were applied via the SQL editor. **13 tables**, all with RLS.

Key tables:
- `profiles` — `id` (= auth user), `role` (`admin`/`candidate`), `full_name`
- `courses`, `quizzes`, `quiz_slots` — catalogue + which questions belong to a quiz
- `questions` — renderable question (stem, type, marks, options, status)
- `question_keys` — **sensitive**: correct answer, model answer, rubric (admin-only, never sent to candidates)
- `attempts` — one row per candidate attempt: `candidate_code`, `state`, `started_at`, `submitted_at`, `score`, `max_score`, `passed`, `performance_band`
- `attempt_answers` — candidate answers (autosaved)
- `attempt_grades` — per-question marks + rationale
- `entitlements`, `certificates`, `cohort_stats`, `jobs` — for the not-yet-built paid tiers / certs / job queue

RLS boundaries: candidates see only their own data; `question_keys` & `attempt_grades` are admin-only; entitlement-gated RPC `get_attempt_result` returns tiered detail.

---

## 6. Code map

```
src/
  app/
    page.tsx                       landing
    login/ register/ auth/callback auth
    dashboard/                     candidate dashboard
    courses/                       candidate catalogue (Start a quiz)
    quiz/[attemptId]/              quiz runner (timer, autosave, auto-submit)
    quiz/actions.ts                startAttempt / submitAttempt (background grade via after())
    results/[attemptId]/           submission receipt (no score on screen)
    verify/                        certificate verification (stub)
    loading.tsx                    animated "thinking brain" route loader
    admin/
      layout.tsx                   admin shell (left sidebar, dark, role-gated)
      admin-nav.tsx                sidebar tabs (active highlight)
      page.tsx                     overview ("Welcome back, Admin")
      generate/                    AI quiz generator (topic + KB upload)
      courses/ , courses/[id]/     course list + detail
      quizzes/[id]/                quiz editor (CRUD, 100-mark, inline AI add)
      results/                     all candidate attempts (search + filter)
      actions.ts                   admin server actions (generate, CRUD, publish, saveAll, aiAdd)
  lib/
    anthropic.ts                   generateQuiz / gradeFreeText (claude-opus-4-8)
    grade.ts                       gradeAttempt — objective + AI grading
    supabase/{client,server,service}.ts
  components/                      navbar, footer, submit-button, page-loading, local-time, ...
supabase/migrations/               0001_schema, 0002_rls, 0003_rename_candidate
```

---

## 7. How the main flows work

**Authoring (admin):** `/admin/generate` → `generateQuiz()` (claude-opus-4-8, structured output; optional PDF as a document block / DOCX via mammoth) → inserts `questions` + `question_keys` + `quiz_slots` at status `review` → `/admin/quizzes/[id]` to edit/add/delete, balance marks to 100, publish.

**Taking (candidate):** `/courses` → Start → `/quiz/[attemptId]` (90-min timer, debounced autosave to `attempt_answers`, resume by reopening) → Submit (or auto-submit on timeout) → `submitAttempt` mints the `candidate_code`, marks submitted, **grades in the background via `after()`**, redirects to the receipt.

**Grading (`lib/grade.ts`, service-role):** MCQ/true-false by exact match in code; short/long via rubric-anchored `gradeFreeText` (claude-opus-4-8). Writes `attempt_grades` + the attempt's score/passed/band.

**Marks model:** each question's `marks` is a weight; quiz total should sum to **100** (editor has "Scale to 100" / "Even split"); pass = half the total.

---

## 8. Pending / next steps

- [ ] **Email delivery** — results & certificates are computed and stored but **not emailed yet**. The receipt promises "emailed"; wire up an email provider (Resend/Postmark/n8n).
- [ ] **Stripe paid tiers** — `entitlements` table + `get_attempt_result` RPC exist; checkout, webhook (idempotent), and tier-gated result views are not built.
- [ ] **Certificates** — `certificates` table exists; signed/verifiable generation + the verify page are stubs.
- [ ] **Real cohort percentile** — needs `cohort_stats` populated (the legacy system faked it).
- [ ] **Server-side timeout sweep** — auto-submit currently only fires while the quiz tab is open; closed-tab timeouts need the `jobs` queue / a cron (planned n8n job engine).
- [ ] **Dependabot** — 1 moderate advisory on the repo; run `npm audit` / Dependabot PR.
- [ ] Optionally connect the repo to Vercel for push-to-deploy; configure Supabase Auth Site URL + Google provider.

---

## 9. Gotchas

- Deploys are CLI-based; the Vercel CLI occasionally exits non-zero with `ECONNRESET` *after* "Deployment completed" — the deploy still succeeded (verify the route/alias).
- LLM routes set `export const maxDuration = 60` (Hobby limit); background grading runs inside that window.
- Candidate timezone: timestamps render client-side (`LocalTime`, `ResultTimes`) so they show the viewer's local time, not server UTC.
- Admins can no longer take quizzes (`startAttempt` redirects them); use a separate candidate account to test the taking flow.
