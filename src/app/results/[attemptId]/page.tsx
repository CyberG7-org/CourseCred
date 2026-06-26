import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ResultTimes } from "./result-times";

export const metadata = { title: "Submission received — ExamCert" };

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
    .select("id, user_id, state, candidate_code, started_at, submitted_at, quiz_id")
    .eq("id", attemptId)
    .single();
  if (!a || a.user_id !== user.id) notFound();
  if (a.state === "in_progress") redirect(`/quiz/${attemptId}`);

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("title")
    .eq("id", a.quiz_id)
    .single();

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-5 py-12">
          <p className="text-sm text-muted">{quiz?.title}</p>
          <h1 className="mt-1 text-3xl font-bold text-brand-dark">Submission received</h1>

          <div className="mt-6 rounded-2xl border border-line bg-white p-8 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-xl font-bold text-green-700">
                ✓
              </span>
              <div>
                <p className="font-bold text-brand-dark">Your responses are recorded</p>
                <p className="text-sm text-muted">
                  Your result will be sent to your email once marking is complete.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-xl bg-canvas p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Candidate ID</span>
                <span className="font-mono text-sm font-bold text-brand-dark">
                  {a.candidate_code ?? "—"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Unique to this attempt — quote it in any query about your result.
              </p>
            </div>

            <div className="mt-4">
              <ResultTimes startedAt={a.started_at} submittedAt={a.submitted_at} />
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-dashed border-line bg-white p-6">
            <h2 className="font-bold text-brand-dark">What happens next?</h2>
            <p className="mt-1 text-sm text-muted">
              Your answers are being marked. You will receive your score, a performance breakdown,
              and (if eligible) your certificate by email. Paid tiers unlock section-by-section
              analysis and percentile ranking.
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
