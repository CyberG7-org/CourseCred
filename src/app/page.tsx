import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

const FEATURES = [
  {
    title: "AI-generated quizzes",
    body: "Courses are built from a knowledge base into rigorous, multi-section exams.",
  },
  {
    title: "Fair AI marking",
    body: "Free-text answers are graded against anchored rubrics with consistency checks.",
  },
  {
    title: "Verifiable certificates",
    body: "Every certificate carries a verification anyone can check in seconds.",
  },
];

type Course = { id: string; title: string; description: string | null };

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("courses")
    .select("id, title, description")
    .eq("status", "published")
    .limit(6);
  const courses = (data ?? []) as Course[];

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <section className="bg-gradient-to-br from-brand-dark to-brand text-white">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <h1 className="max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
              AI-graded exams. Instant results. Verifiable certificates.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-brand-light">
              Take expert-built quizzes, get marked by AI in minutes, and earn a
              certificate anyone can verify.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/register"
                className="rounded-xl bg-white px-6 py-3 font-bold text-brand-dark hover:bg-brand-soft"
              >
                Get started free
              </Link>
              <Link
                href="/courses"
                className="rounded-xl border border-white/40 px-6 py-3 font-bold text-white hover:bg-white/10"
              >
                Browse courses
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <div className="grid gap-6 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-line bg-white p-6 shadow-sm"
              >
                <h3 className="text-lg font-bold text-brand-dark">{f.title}</h3>
                <p className="mt-2 text-sm text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20">
          <h2 className="mb-6 text-2xl font-bold text-brand-dark">
            Featured courses
          </h2>
          {courses.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((c) => (
                <Link
                  key={c.id}
                  href="/courses"
                  className="rounded-2xl border border-line bg-white p-6 shadow-sm transition hover:shadow-md"
                >
                  <h3 className="text-lg font-bold text-ink">{c.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm text-muted">
                    {c.description ?? "AI-generated assessment."}
                  </p>
                  <span className="mt-4 inline-block text-sm font-semibold text-brand">
                    Start →
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-white p-10 text-center text-muted">
              No published courses yet — they’ll appear here once an admin
              publishes one.
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
