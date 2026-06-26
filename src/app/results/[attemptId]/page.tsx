import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export const metadata = { title: "Your result — ExamCert" };

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
      "id, user_id, state, score, max_score, passed, performance_band, candidate_code, quiz_id",
    )
    .eq("id", attemptId)
    .single();
  if (!a || a.user_id !== user.id) notFound();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("title")
    .eq("id", a.quiz_id)
    .single();

  const graded = a.state === "graded";

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-5 py-12">
          <p className="text-sm text-muted">{quiz?.title}</p>
          <h1 className="mt-1 text-3xl font-bold text-brand-dark">Your result</h1>

          {graded ? (
            <div className="mt-6 rounded-2xl border border-line bg-white p-8 text-center shadow-sm">
              <p className="text-sm font-semibold text-muted">Score</p>
              <p className="mt-2 text-5xl font-extrabold text-brand-dark">
                {a.score}
                <span className="text-2xl text-muted">/{a.max_score}</span>
              </p>
              <p
                className={`mt-4 inline-block rounded-full px-4 py-1.5 text-sm font-bold ${
                  a.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                }`}
              >
                {a.passed ? "PASS" : "FAIL"}
              </p>
              {a.performance_band && (
                <p className="mt-3 text-muted">{a.performance_band}</p>
              )}
              {a.candidate_code && (
                <p className="mt-2 text-xs text-muted">
                  Candidate ID: {a.candidate_code}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-line bg-white p-8 text-center shadow-sm">
              <p className="text-lg font-bold text-brand-dark">Submitted ✓</p>
              <p className="mt-2 text-muted">
                Your answers are in and grading is being finalised — check back shortly.
              </p>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-dashed border-line bg-white p-6">
            <h2 className="font-bold text-brand-dark">Want the full breakdown?</h2>
            <p className="mt-1 text-sm text-muted">
              Section-by-section analysis, percentile ranking, a full diagnostic, and a
              verifiable certificate are coming with paid tiers.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl bg-brand px-5 py-3 font-bold text-white hover:bg-brand-dark"
            >
              Back to dashboard
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
