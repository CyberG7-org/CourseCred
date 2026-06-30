import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { SubmitButton } from "@/components/submit-button";
import { LocalTime } from "@/components/local-time";
import { startAttempt } from "@/app/quiz/actions";

export const metadata = { title: "Dashboard — CourseCred" };

type CourseRow = {
  id: string;
  title: string;
  description: string | null;
  quizzes: { id: string; title: string }[] | null;
};
type CourseMini = { title: string | null };
type QuizMini = { title: string | null; courses: CourseMini | CourseMini[] | null };
type AttemptRow = {
  id: string;
  score: number | null;
  max_score: number | null;
  passed: boolean | null;
  submitted_at: string | null;
  quizzes: QuizMini | QuizMini[] | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard");

  // Admins belong in the admin console, not the candidate dashboard.
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role === "admin") redirect("/admin");

  const [coursesRes, attemptsRes, certs, entsRes] = await Promise.all([
    supabase
      .from("courses")
      .select("id, title, description, quizzes(id, title)", { count: "exact" })
      .eq("status", "published")
      .order("title")
      .limit(5),
    supabase
      .from("attempts")
      .select("id, score, max_score, passed, submitted_at, quizzes(title, courses(title))")
      .eq("user_id", user.id)
      .eq("state", "graded")
      .order("submitted_at", { ascending: false })
      .limit(12),
    supabase
      .from("certificates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase.from("entitlements").select("attempt_id, tier").eq("user_id", user.id),
  ]);

  const courses = (coursesRes.data ?? []) as CourseRow[];
  const availableCount = coursesRes.count ?? courses.length;
  const graded = (attemptsRes.data ?? []) as AttemptRow[];

  // Highest unlocked tier per attempt → "Tier N" badge in the history list.
  const tierByAttempt = new Map<string, number>();
  for (const e of (entsRes.data ?? []) as { attempt_id: string; tier: number }[]) {
    tierByAttempt.set(e.attempt_id, Math.max(tierByAttempt.get(e.attempt_id) ?? 1, e.tier));
  }

  const completedCount = graded.length;
  const passedCount = graded.filter((a) => a.passed).length;
  const passRate = completedCount ? Math.round((passedCount / completedCount) * 100) : null;

  const chart = [...graded]
    .reverse()
    .slice(-8)
    .map((a) => ({
      pct: a.max_score ? Math.round((Number(a.score) / Number(a.max_score)) * 100) : 0,
      passed: !!a.passed,
    }));

  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "Candidate";

  const cards = [
    { label: "Available courses", value: String(availableCount) },
    { label: "Completed", value: String(completedCount) },
    { label: "Pass rate", value: passRate != null ? `${passRate}%` : "—" },
    { label: "Certificates", value: String(certs.count ?? 0) },
  ];

  // Donut geometry
  const R = 42;
  const C = 2 * Math.PI * R;
  const dash = passRate != null ? (passRate / 100) * C : 0;

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-brand-dark">Welcome back, {name}</h1>
              <p className="mt-1 text-muted">Track your courses, results, and certificates.</p>
            </div>
            <span className="rounded-full border border-line bg-white px-4 py-2 text-sm text-muted">
              {user.email}
            </span>
          </div>

          {/* Stat cards */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-muted">{c.label}</p>
                <p className="mt-3 text-3xl font-bold text-brand-dark">{c.value}</p>
              </div>
            ))}
          </div>

          {/* Performance viz */}
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-line bg-white p-6 shadow-sm lg:col-span-2">
              <h2 className="text-lg font-bold text-brand-dark">Your performance</h2>
              {chart.length > 0 ? (
                <>
                  <div className="mt-6 flex h-40 items-end gap-3 border-b border-line">
                    {chart.map((d, i) => (
                      <div
                        key={i}
                        className="flex flex-1 flex-col items-center justify-end gap-1"
                      >
                        <span className="text-xs font-bold text-ink">{d.pct}%</span>
                        <div
                          className="w-full rounded-t-md"
                          style={{
                            height: `${Math.max(d.pct, 2)}%`,
                            background: d.passed ? "#16a34a" : "#dc2626",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    Score on your last {chart.length} attempt{chart.length > 1 ? "s" : ""} —{" "}
                    <span className="font-semibold text-green-700">green = pass</span>,{" "}
                    <span className="font-semibold text-red-700">red = fail</span>.
                  </p>
                </>
              ) : (
                <div className="mt-4 flex h-40 flex-col items-center justify-center rounded-xl bg-canvas text-center">
                  <p className="text-sm font-semibold text-muted">No results yet</p>
                  <p className="mt-1 text-xs text-muted">
                    Take a course below — your scores will chart here.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-white p-6 shadow-sm">
              <h2 className="self-start text-lg font-bold text-brand-dark">Pass rate</h2>
              <svg viewBox="0 0 120 120" className="mt-3 h-36 w-36">
                <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-line)" strokeWidth="12" />
                {passRate != null && (
                  <circle
                    cx="60"
                    cy="60"
                    r={R}
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth="12"
                    strokeDasharray={`${dash} ${C}`}
                    strokeLinecap="round"
                    transform="rotate(-90 60 60)"
                  />
                )}
                <text x="60" y="58" textAnchor="middle" className="fill-brand-dark" fontSize="24" fontWeight="bold">
                  {passRate != null ? `${passRate}%` : "—"}
                </text>
                <text x="60" y="78" textAnchor="middle" className="fill-muted" fontSize="10">
                  {completedCount} taken
                </text>
              </svg>
            </div>
          </div>

          {/* Continue learning — course list */}
          <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-brand-dark">Continue learning</h2>
              {availableCount > courses.length && (
                <Link href="/courses" className="text-sm font-semibold text-brand hover:underline">
                  View all {availableCount} →
                </Link>
              )}
            </div>

            {courses.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                No courses are published yet. Check back soon.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {courses.map((c) => {
                  const quiz = c.quizzes?.[0];
                  return (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4 hover:bg-canvas"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-ink">{c.title}</p>
                        <p className="line-clamp-1 text-sm text-muted">
                          {c.description ?? "AI-graded assessment with a verifiable certificate."}
                        </p>
                      </div>
                      {quiz ? (
                        <form action={startAttempt.bind(null, quiz.id)} className="shrink-0">
                          <SubmitButton
                            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-dark"
                            pendingText="Starting…"
                          >
                            Take the course now →
                          </SubmitButton>
                        </form>
                      ) : (
                        <span className="shrink-0 rounded-lg bg-canvas px-3 py-2 text-xs font-semibold text-muted">
                          No quiz yet
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Your attempts — history */}
          {graded.length > 0 && (
            <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-brand-dark">Your attempts</h2>
              <p className="mt-1 text-sm text-muted">
                Courses you&apos;ve taken — review the answers you gave.
              </p>
              <div className="mt-4 space-y-2">
                {graded.map((at) => {
                  const q = Array.isArray(at.quizzes) ? at.quizzes[0] : at.quizzes;
                  const co = q && (Array.isArray(q.courses) ? q.courses[0] : q.courses);
                  return (
                    <div
                      key={at.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{q?.title ?? "Quiz"}</p>
                        <p className="text-xs text-muted">
                          {co?.title ? `${co.title} · ` : ""}
                          <LocalTime iso={at.submitted_at} />
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {tierByAttempt.has(at.id) && (
                          <span className="rounded-full bg-brand-light/40 px-2.5 py-1 text-xs font-bold text-brand-dark">
                            Tier {tierByAttempt.get(at.id)}
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            at.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {at.passed ? "PASS" : "FAIL"}
                        </span>
                        <Link
                          href={`/results/${at.id}/review`}
                          className="text-sm font-semibold text-brand hover:underline"
                        >
                          Review answers →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
