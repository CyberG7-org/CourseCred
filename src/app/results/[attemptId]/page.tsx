import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ResultTimes } from "./result-times";
import { AutoRefresh } from "./auto-refresh";
import { Marking } from "./marking";
import { tiersAbove, TIER_INFO, upgradeUrl } from "@/lib/tiers";

export const metadata = { title: "Your result — CourseCred" };

type Section = { section_no: number; awarded: number; max: number };
type Question = { question_id: string; awarded: number; max: number; rationale: string | null };
type AttemptResult = {
  state: string;
  score: number | null;
  max_score: number | null;
  passed: boolean | null;
  tier: number;
  sections?: Section[];
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
      "id, user_id, state, candidate_code, started_at, submitted_at, result_sent_at, quiz_id",
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

  // Released → tier-gated result via the RPC.
  const { data: res } = await supabase.rpc("get_attempt_result", { p_attempt_id: attemptId });
  const r = (res ?? {}) as AttemptResult;
  const tier = r.tier ?? 1;
  const email = user.email ?? "";
  const upgrades = tiersAbove(tier);

  // The tier report PDF lands in Supabase Storage at a predictable path
  // (uploaded by the n8n tier workflow). Show a download once it exists.
  const reportUrl =
    tier >= 2 && a.candidate_code
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/reports/${a.candidate_code}/tier${tier}.pdf`
      : null;
  let reportReady = false;
  if (reportUrl) {
    try {
      const head = await fetch(reportUrl, { method: "HEAD", cache: "no-store" });
      reportReady = head.ok;
    } catch {
      reportReady = false;
    }
  }

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

          {tier >= 2 && (
            <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-brand-dark">Your Tier {tier} report</h2>
                  <p className="mt-1 text-sm text-muted">
                    {reportReady
                      ? "Your detailed PDF report — also sent to your email."
                      : "Your report is being prepared and will arrive by email shortly."}
                  </p>
                </div>
                {reportReady && reportUrl ? (
                  <a
                    href={reportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-dark"
                  >
                    Download PDF →
                  </a>
                ) : (
                  <span className="shrink-0 rounded-xl bg-canvas px-4 py-2.5 text-sm font-semibold text-muted">
                    Generating…
                  </span>
                )}
              </div>
            </div>
          )}

          {tier >= 2 && r.sections && r.sections.length > 0 && (
            <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
              <h2 className="font-bold text-brand-dark">Section breakdown</h2>
              <div className="mt-3 space-y-2">
                {r.sections.map((s) => (
                  <div
                    key={s.section_no}
                    className="flex items-center justify-between border-t border-line py-2 text-sm first:border-t-0"
                  >
                    <span className="text-muted">Section {s.section_no}</span>
                    <span className="font-semibold text-ink">
                      {Number(s.awarded)} / {Number(s.max)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
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
