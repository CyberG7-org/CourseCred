import Link from "next/link";
import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ResultTimes } from "./result-times";
import { AutoRefresh } from "./auto-refresh";
import { Marking } from "./marking";
import { tiersAbove, TIER_INFO, upgradeUrl } from "@/lib/tiers";
import { SectionBreakdown, SectionBreakdownSkeleton } from "./section-breakdown";

export const metadata = { title: "Your result — CourseCred" };
export const maxDuration = 30; // first view may generate the AI section analysis

type Question = { question_id: string; awarded: number; max: number; rationale: string | null };
type AttemptResult = {
  state: string;
  score: number | null;
  max_score: number | null;
  passed: boolean | null;
  tier: number;
  percentile?: number | null;
  questions?: Question[];
};

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/results/${attemptId}`);

  const { data: a } = await supabase
    .from("attempts")
    .select(
      "id, user_id, state, candidate_code, started_at, submitted_at, result_sent_at, quiz_id, score, max_score, passed",
    )
    .eq("id", attemptId)
    .single();
  if (!a || a.user_id !== user.id) notFound();
  if (a.state === "in_progress") redirect(`/quiz/${attemptId}`);

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("title")
    .eq("id", a.quiz_id)
    .single();

  // Still grading → brief auto-refreshing "marking" state, then the result appears.
  if (a.state !== "graded") {
    return (
      <>
        <Navbar />
        <main className="flex-1">
          <div className="mx-auto max-w-2xl px-5 py-12">
            <AutoRefresh />
            <p className="text-sm text-muted">{quiz?.title}</p>
            <h1 className="mt-1 text-3xl font-bold text-brand-dark">Marking your answers…</h1>
            <div className="mt-6 rounded-2xl border border-line bg-white p-8 shadow-sm">
              <Marking />
              <p className="mt-6 text-center text-sm text-muted">
                We&apos;re grading your answers — your result appears here in a moment, and a copy is
                emailed to you.
              </p>
              <div className="mt-6 rounded-xl bg-canvas p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">Candidate ID</span>
                  <span className="font-mono text-sm font-bold text-brand-dark">
                    {a.candidate_code ?? "—"}
                  </span>
                </div>
              </div>
              <div className="mt-4">
                <ResultTimes startedAt={a.started_at} submittedAt={a.submitted_at} />
              </div>
            </div>
            <div className="mt-6">
              <Link href="/dashboard" className="text-sm font-semibold text-brand hover:underline">
                ← Back to dashboard
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  // Released → assemble the tier-gated result directly. Ownership is verified
  // above, so we read the entitlement tier + gated grade data with the service
  // client (attempt_grades is admin-only via RLS). This is robust regardless of
  // the get_attempt_result RPC's deployed state.
  const svc = createServiceClient();
  const { data: ents } = await svc.from("entitlements").select("tier").eq("attempt_id", attemptId);
  const tier = (ents ?? []).reduce((m, e) => Math.max(m, Number(e.tier) || 1), 1);

  let percentile: number | null = null;
  if (tier >= 3 && a.score != null) {
    const { count: total } = await svc
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", a.quiz_id)
      .eq("state", "graded");
    const { count: below } = await svc
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", a.quiz_id)
      .eq("state", "graded")
      .lt("score", a.score);
    percentile = total ? Math.round(((below ?? 0) / total) * 100) : null;
  }

  let questions: Question[] | undefined;
  if (tier >= 4) {
    const { data: qg } = await svc
      .from("attempt_grades")
      .select("question_id, awarded_marks, max_marks, rationale")
      .eq("attempt_id", attemptId);
    questions = (qg ?? []).map(
      (x: {
        question_id: string;
        awarded_marks: number;
        max_marks: number;
        rationale: string | null;
      }) => ({
        question_id: x.question_id,
        awarded: Number(x.awarded_marks) || 0,
        max: Number(x.max_marks) || 0,
        rationale: x.rationale,
      }),
    );
  }

  const r: AttemptResult = {
    state: a.state,
    score: a.score,
    max_score: a.max_score,
    passed: a.passed,
    tier,
    percentile,
    questions,
  };
  const email = user.email ?? "";
  const upgrades = tiersAbove(tier);

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-5 py-12">
          <p className="text-sm text-muted">{quiz?.title}</p>
          <h1 className="mt-1 text-3xl font-bold text-brand-dark">Your result</h1>

          <div className="mt-6 rounded-2xl border border-line bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-semibold text-muted">Outcome</p>
            <p
              className={`mt-2 text-5xl font-extrabold ${
                r.passed ? "text-green-600" : "text-red-600"
              }`}
            >
              {r.passed ? "PASS" : "FAIL"}
            </p>
            {tier >= 2 && r.score != null ? (
              <p className="mt-3 text-lg font-bold text-brand-dark">
                {Number(r.score)} / {Number(r.max_score)}
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted">
                Tier 1 shows your outcome only — unlock the score &amp; breakdown below.
              </p>
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Candidate ID</span>
              <span className="font-mono text-sm font-bold text-brand-dark">
                {a.candidate_code ?? "—"}
              </span>
            </div>
            <div className="mt-2">
              <ResultTimes startedAt={a.started_at} submittedAt={a.submitted_at} />
            </div>
          </div>

          {r.passed && (
            <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-green-800">🎓 You&apos;re eligible for a certificate</h2>
                  <p className="mt-1 text-sm text-green-700">
                    You passed — download your official CourseCred certificate of completion.
                  </p>
                </div>
                <a
                  href={`/api/certificate/${attemptId}`}
                  className="shrink-0 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700"
                >
                  Download certificate
                </a>
              </div>
            </div>
          )}

          {tier >= 2 && (
            <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-brand-dark">Your Tier {tier} report</h2>
                  <p className="mt-1 text-sm text-muted">
                    Your detailed performance report — a copy is also emailed to you.
                  </p>
                </div>
                <a
                  href={`/api/report/${attemptId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-dark"
                >
                  Download PDF →
                </a>
              </div>
            </div>
          )}

          {tier >= 2 && (
            <Suspense fallback={<SectionBreakdownSkeleton />}>
              <SectionBreakdown attemptId={attemptId} />
            </Suspense>
          )}

          {tier >= 3 && r.percentile != null && (
            <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
              <h2 className="font-bold text-brand-dark">Ranking</h2>
              <p className="mt-1 text-sm text-muted">
                You scored higher than <b>{Math.round(r.percentile)}%</b> of candidates on this quiz.
              </p>
            </div>
          )}

          {tier >= 4 && r.questions && r.questions.length > 0 && (
            <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
              <h2 className="font-bold text-brand-dark">Per-question diagnostic</h2>
              <ol className="mt-3 space-y-2 text-sm">
                {r.questions.map((q, i) => (
                  <li key={q.question_id} className="border-t border-line py-2 first:border-t-0">
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Question {i + 1}</span>
                      <span className="font-semibold text-ink">
                        {Number(q.awarded)} / {Number(q.max)}
                      </span>
                    </div>
                    {q.rationale && <p className="mt-1 text-xs text-muted">{q.rationale}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {upgrades.length > 0 && (
            <div className="mt-6 rounded-2xl border border-dashed border-line bg-white p-6">
              <h2 className="font-bold text-brand-dark">Unlock more</h2>
              <p className="mt-1 text-xs text-muted">
                Unlocks <b>this result only</b> — Candidate ID{" "}
                <span className="font-mono">{a.candidate_code ?? "—"}</span>. Each course you take is
                upgraded separately.
              </p>
              <div className="mt-3 space-y-4">
                {upgrades.map((t) => (
                  <div key={t}>
                    <p className="font-semibold text-ink">{TIER_INFO[t].title}</p>
                    <p className="text-sm text-muted">{TIER_INFO[t].desc}</p>
                    <a
                      href={upgradeUrl(t, a.candidate_code ?? "", email)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block rounded-xl px-4 py-2 text-sm font-bold text-white"
                      style={{ background: TIER_INFO[t].color }}
                    >
                      Upgrade to Tier {t}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl bg-brand px-5 py-3 font-bold text-white hover:bg-brand-dark"
            >
              Back to dashboard
            </Link>
            <Link
              href={`/results/${attemptId}/review`}
              className="rounded-xl border border-line px-5 py-3 font-bold text-ink hover:bg-canvas"
            >
              Review your answers
            </Link>
            <Link
              href="/courses"
              className="rounded-xl border border-line px-5 py-3 font-bold text-ink hover:bg-canvas"
            >
              More quizzes
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
