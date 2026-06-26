import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export const metadata = { title: "Dashboard — ExamCert" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard");

  const [quizzes, completed, certs, latest] = await Promise.all([
    supabase
      .from("quizzes")
      .select("id", { count: "exact", head: true })
      .eq("status", "published"),
    supabase
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("state", "graded"),
    supabase
      .from("certificates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("attempts")
      .select("score, max_score, passed, submitted_at")
      .eq("user_id", user.id)
      .eq("state", "graded")
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "Candidate";

  const latestRow = latest.data as
    | { score: number | null; max_score: number | null }
    | null;

  const cards = [
    { label: "Available quizzes", value: String(quizzes.count ?? 0) },
    { label: "Completed", value: String(completed.count ?? 0) },
    { label: "Certificates", value: String(certs.count ?? 0) },
    {
      label: "Latest result",
      value: latestRow
        ? `${latestRow.score ?? "–"}/${latestRow.max_score ?? 100}`
        : "–",
    },
  ];

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-brand-dark">
                Welcome back, {name}
              </h1>
              <p className="mt-1 text-muted">
                Track your quizzes, results, and certificates.
              </p>
            </div>
            <span className="rounded-full border border-line bg-white px-4 py-2 text-sm text-muted">
              {user.email}
            </span>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => (
              <div
                key={c.label}
                className="rounded-2xl border border-line bg-white p-5 shadow-sm"
              >
                <p className="text-sm font-semibold text-muted">{c.label}</p>
                <p className="mt-3 text-3xl font-bold text-brand-dark">
                  {c.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-line bg-white p-6 shadow-sm lg:col-span-2">
              <h2 className="text-lg font-bold text-brand-dark">
                Continue learning
              </h2>
              <p className="mt-2 text-sm text-muted">
                Browse available courses and start your next assessment.
              </p>
              <Link
                href="/courses"
                className="mt-4 inline-block rounded-xl bg-brand px-5 py-3 font-bold text-white hover:bg-brand-dark"
              >
                Browse courses
              </Link>
            </div>
            <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-brand-dark">Certificates</h2>
              <p className="mt-2 text-sm text-muted">
                {certs.count
                  ? `You have ${certs.count} certificate(s).`
                  : "No certificate yet — pass a quiz to earn one."}
              </p>
              <Link
                href="/verify"
                className="mt-4 inline-block text-sm font-semibold text-brand"
              >
                Verify a certificate →
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
