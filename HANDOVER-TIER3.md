# CourseCred — Tier 3 Report Build Handover

_Continue this in Codex. Everything below is current as of commit `ceda5eb`._

## 0. Project quick facts
- **App:** CourseCred — Next.js 16 (App Router, Turbopack) + Supabase + Vercel. AI-graded exam & certification platform.
- **Local repo:** `C:\Users\cyber\Downloads\Claude MCP\ExamCert Platform\web`  (note the space in the path — quote it).
- **GitHub:** `CyberG7-org/CourseCred`, branch **`master`**. `git push origin master`.
- **Live:** https://coursecred.vercel.app
- **Deploy (CLI, not git-linked):**
  ```bash
  DIR="C:/Users/cyber/Downloads/Claude MCP/ExamCert Platform/web"
  URL="https://ysxbemvuhljslfftcvev.supabase.co"; KEY="sb_publishable_C24UJM9O7ICN04M7jjZV0Q_Jm4ZJtYZ"
  RHOOK="https://cyberg7support.app.n8n.cloud/webhook/coursecred"
  THOOK="https://cyberg7support.app.n8n.cloud/webhook/coursecred-tier"
  npx --yes vercel deploy --prod --yes --cwd "$DIR" \
    -b NEXT_PUBLIC_SUPABASE_URL="$URL" -b NEXT_PUBLIC_SUPABASE_ANON_KEY="$KEY" \
    -e NEXT_PUBLIC_SUPABASE_URL="$URL" -e NEXT_PUBLIC_SUPABASE_ANON_KEY="$KEY" \
    -e N8N_RESULT_WEBHOOK_URL="$RHOOK" -e N8N_TIER_WEBHOOK_URL="$THOOK"
  ```
  Server secrets (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_*`) are **project env vars in Vercel** — do not pass or print them. `.env.local` is gitignored.
- **Supabase:** project `ysxbemvuhljslfftcvev`. Migrations in `supabase/migrations/` are **run manually** by the user in the SQL editor (no CLI migration runner wired).

## 1. CRITICAL architecture: how the PDFs are made
**The Google Slides API is DISABLED on the user's GCP project (`SERVICE_DISABLED`).** The old n8n "copy Slides template → batchUpdate → export PDF" flow therefore **fails** and is abandoned. Instead:

> Each Slides template is a **1060.5 × 1500 pt portrait page whose entire design is baked into a full-bleed background PNG**, with only the dynamic values as text overlays (font ≈ Georgia → we use `StandardFonts.TimesRoman`; text colour `#B45F06` = `rgb(0.706,0.373,0.024)`, the `GOLD` const).

We **generate the PDFs in-app with `pdf-lib`**: draw the background PNG full-page, then `drawText` the values at the exact coordinates extracted from the template's OOXML.

- Background PNGs live in **`public/`**: `cert-bg.png`, `tier2-bg.png` (Tier-3/4 backgrounds **not yet extracted** — see §4).
- Draw logic: **`src/lib/pdf-templates.ts`** — `buildCertPdf`, `buildReportPdf`.
- To extract a template's background + coordinates: use the **google_workspace MCP** `get_drive_file_download_url` with `export_format:"pptx"` (email `cyberg7.llp@gmail.com`), unzip the PPTX, read `ppt/slides/slideN.xml` (+ `_rels`, `ppt/media/*`, `ppt/presentation.xml`). EMU→pt = ÷12700. **Do NOT use `get_presentation`** (Slides API disabled).

### Local render QA loop (use this — it's how every PDF was tuned)
Write a temp `web/scripts/pdftest.mts` that imports the builder, renders with dummy data + the real bg to the scratchpad, then **Read the PDF** to eyeball it; iterate on coordinates; **delete the script before building** (Next type-checks `scripts/` and the `.ts` import extension breaks the build). Example:
```ts
import { readFileSync, writeFileSync } from "node:fs";
import { buildReportPdf } from "../src/lib/pdf-templates.ts";
const bg = readFileSync(new URL("../public/tier2-bg.png", import.meta.url));
writeFileSync("<scratch>/t.pdf", await buildReportPdf({ /* dummy */ bgBytes: bg }));
```
Run: `cd web && npx --yes tsx scripts/pdftest.mts`.

## 2. What already works (DONE)
- **Certificate** — free on PASS. Route `src/app/api/certificate/[attemptId]/route.ts`; `buildCertPdf` draws `cert-bg.png` + name/candidateId/course/"On date" (centered) + a **QR** (npm `qrcode`) encoding `/verify?id=<verify_id>`. Mints an idempotent `certificates` row (serial `CC-YYYY-XXXXXX` + verify_id). Result page shows a green "eligible" card when `r.passed`.
- **Tier-2 report** — Route `src/app/api/report/[attemptId]/route.ts` (gate `tier < 2 → 403`). `buildReportPdf` draws `tier2-bg.png`, overlays Name/Candidate ID/Date/Course + fills the **baked 4-row Section table** (coords `ROW_TOP=[655.4,758.7,862.1,965.4]`, cell x≈286 w≈590 h≈103.3) — text **auto-fits** 18→12pt per cell; unused rows stay empty; Grade bold. **Sections capped at 4** (input `max={4}` + server `Math.min(4,…)` in `admin/actions.ts` + client clamp in `admin/generate/generate-form.tsx`).
- **AI section analysis** — `src/lib/section-analysis.ts` `getSectionsWithAnalysis(attemptId)` groups grades+answers by section, calls `generateSectionAnalysis` (short 1-2 sentence verdict, `src/lib/anthropic.ts`), caches JSON in **`attempts.section_analysis`** (migration `0006`, optional — regenerates if absent). Shared by the web result page (`section-breakdown.tsx`, streamed in `<Suspense>`) and the Tier-2 PDF.
- **Result page** (`src/app/results/[attemptId]/page.tsx`) — **RPC-independent**: assembles tier + percentile(T3) + per-question(T4) directly via the service client (the `get_attempt_result` RPC was flaky). Order: Outcome+score → Candidate ID/times → certificate card (if pass) → "Download PDF" report card (tier≥2 → `/api/report`) → Section analysis (tier≥2) → Ranking (tier≥3) → Per-question (tier≥4) → Unlock-more.
- **Verify** (`/verify`) auto-checks `?id=` and shows quiz/candidate/timing (migration `0007`, **required**).

## 3. Uncommitted change already on disk
`src/lib/anthropic.ts` has a NEW exported function **`generateDetailedSectionAnalysis(sections)`** returning `DetailedSectionOut[] = {section_no, performance_analysis, strengths[], weaknesses[]}[]` — this is the Tier-3 format generator (opus-4-8, structured output). It reuses the existing `SectionAnalysisInput` type. **Commit it or build on it.** (It compiles; exports aren't flagged unused.)

## 4. THE TIER 3 TASK (what to build)
**Goal:** a Tier-3 "Ranking & Comparison Report" PDF that matches the user's legacy template — a **3-page** report, one/multiple **Section BREAKDOWN** blocks per page, each with **Section Score, Performance Analysis paragraph, Strengths bullets, Weaknesses bullets**, plus a **Section Breakdown Chart** (donut/pie of the 4 section scores).

### Legacy Tier-3 Slides template (source of truth)
- **File id:** `10OQrjGqDDzq-xHUXYT9CsZ71tGbsyOtNermvoQA2eZQ` — **3 slides**, 1060.5×1500 pt each. Placeholders per page (confirmed via PPTX text extract):
  - **Page 1:** `[[NAME]]`, `[[CANDIDATE_ID]]`, `[[DATE]]`, `[[COURSE NAME]]`, `[[SCORE]]`, `[[SECTION 1 BREAKDOWN]]`
  - **Page 2:** `[[SECTION 2 BREAKDOWN]]`, `[[SECTION 3 BREAKDOWN]]`
  - **Page 3:** `[[SECTION 4 BREAKDOWN]]`
  - There is also a **`SECTION BREAKDOWN CHART`** image placeholder somewhere (the user's legacy output had a **donut of Section 1–4 scores**). Confirm its slide + position when extracting.
- **Tier-4 template** (for later): `1XHQhVKOZdKNrF35FsX7sXXu008FN1YXh4NVt1MZUCkA`.
- Each `[[SECTION n BREAKDOWN]]` cell holds this shape (from the user's real legacy text):
  ```
  Section Score: 25/25
  Performance Analysis: <2-3 sentences>
  Strengths:
  - <bullet>
  - <bullet>
  Weaknesses:
  - No significant weaknesses were identified.
  ```

### Step-by-step
1. **Extract the Tier-3 template** (the subagent for this FAILED on API limit — redo it). Download PPTX via `get_drive_file_download_url(export_format:"pptx", user_google_email:"cyberg7.llp@gmail.com")`, unzip, and for **each of the 3 slides** capture: the full-bleed **background media PNG** + every overlay text-box's **x/y/width/height/fontSize** + the **chart image placeholder** position/size. Save the 3 backgrounds to `public/tier3-bg-1.png`, `tier3-bg-2.png`, `tier3-bg-3.png` (pixel size should be ~1448×2048 like the others).
2. **`buildTier3ReportPdf(...)` in `src/lib/pdf-templates.ts`** — a **3-page** PDF (`pdf.addPage([1060.5,1500])` ×3). Page 1 draws bg-1 + Name/Candidate ID/Date/Course/Score overlays + Section 1 breakdown block + the **donut chart**. Page 2 draws bg-2 + Section 2 & 3 blocks. Page 3 draws bg-3 + Section 4 block. Reuse `wrapText`, `GOLD`, `PAGE_W/H`, `left()`/`centered()` helpers. Render each breakdown block from the `DetailedSectionOut` (bold "Strengths:"/"Weaknesses:" labels + bulleted lines). **Auto-fit font** like `buildReportPdf` so long text stays inside its zone.
3. **The donut chart:** generate a donut of the 4 section scores. Simplest robust option = **QuickChart**: build a URL `https://quickchart.io/chart?c={type:'doughnut',...}` (colours from the user's image: `#4E79A7,#F28E2B,#E15759,#76B7B2`), `fetch()` it to a PNG in the route, `embedPng`, `drawImage` at the placeholder rect. (Alternative: draw arcs with pdf-lib — more work.) The route already fetches the bg over HTTP the same way.
4. **Wire the report route** `src/app/api/report/[attemptId]/route.ts`: branch by tier — `tier === 2` → `buildReportPdf` (current); **`tier >= 3` → `buildTier3ReportPdf`** using `generateDetailedSectionAnalysis` (cache its output too, e.g. a second jsonb column `attempts.detailed_analysis` via a new migration `0008`, or reuse `section_analysis` keyed by shape — recommend a new column to keep the short Tier-2 verdicts separate). Keep the tier-2 path unchanged. (`tier === 4` can fall through to Tier-3 layout until the Tier-4 template is built.)
5. **Result page** already links tier≥2 to `/api/report`, so no page change needed — the route picks the layout by tier. Optionally show the Ranking/percentile block content inside the PDF too (the template is "Ranking & Comparison Report"; the donut is the comparison visual — percentile text can go near it if the template has a slot).
6. **QA** with the local render loop (§1) at 2 and 4 sections before deploying. Then build + deploy + commit + push.

### Data you already have server-side
`getSectionsWithAnalysis` / the report route already compute per-section `{awarded,max}` and per-question `{type,stem,awarded,max,answer}` grouped by section (`bySec`), which is exactly the input `generateDetailedSectionAnalysis` needs (`SectionAnalysisInput[]`). `[[SCORE]]` = overall `attempts.score`/`max_score`.

## 5. Pending Supabase migrations (user runs in SQL editor)
- **`0007_verify_details.sql`** — REQUIRED for the enriched verify page.
- **`0006_section_analysis.sql`** — optional (report analysis cache): `alter table public.attempts add column if not exists section_analysis jsonb;`
- If you add a Tier-3 cache column, write `0008_*.sql` and tell the user to run it (e.g. `alter table public.attempts add column if not exists detailed_analysis jsonb;`).

## 6. Key file map
| File | Purpose |
|---|---|
| `src/lib/pdf-templates.ts` | pdf-lib builders (`buildCertPdf`, `buildReportPdf`; **add `buildTier3ReportPdf`**) |
| `src/lib/anthropic.ts` | AI calls — `generateSectionAnalysis` (T2), **`generateDetailedSectionAnalysis` (T3, uncommitted)**, `gradeFreeText`, `generateQuiz` |
| `src/lib/section-analysis.ts` | `getSectionsWithAnalysis` shared engine + `fallbackAnalysis` |
| `src/app/api/report/[attemptId]/route.ts` | report route — **branch by tier here** |
| `src/app/api/certificate/[attemptId]/route.ts` | cert route |
| `src/app/results/[attemptId]/page.tsx` + `section-breakdown.tsx` | web result page (RPC-independent, streamed section analysis) |
| `public/cert-bg.png`, `public/tier2-bg.png` | template backgrounds (**add `tier3-bg-1/2/3.png`**) |
| `supabase/migrations/000{1..7}` | schema; run manually |

## 7. Gotchas
- Path has a space — always quote it. Windows: LF→CRLF git warnings are harmless.
- Delete any temp `scripts/*.mts` before `npm run build` (Next type-checks it; `.ts` import extension errors the build).
- Reading a non-existent column (e.g. before a migration is run) returns a supabase-js `{error}` (not a throw) — code degrades gracefully; keep that pattern.
- To regenerate cached analysis for old attempts after prompt changes: `update public.attempts set section_analysis = null;` (and the new detailed column) in SQL editor.
- Vercel CLI sometimes returns a transient non-zero after "Deployment completed" — the deploy loop retries and checks the alias returns 200.
