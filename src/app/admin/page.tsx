import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Admin overview — CourseCred" };

export default async function AdminOverview() {
  const supabase = await createClient();
  const [courses, quizzes, review, candidates] = await Promise.all([
    supabase.from("courses").select("id", { count: "exact", head: true }),
    supabase.from("quizzes").select("id", { count: "exact", head: true }),
    supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("status", "review"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "candidate"),
  ]);

  const cards = [
    { label: "Courses", value: courses.count ?? 0 },
    { label: "Quizzes", value: quizzes.count ?? 0 },
    { label: "Questions to review", value: review.count ?? 0 },
    { label: "Candidates", value: candidates.count ?? 0 },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Welcome back, Admin</h1>
      <p className="mt-1 text-sm text-muted">Your platform at a glance.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-line bg-white p-5 shadow-sm"
          >
            <p className="text-sm font-semibold text-muted">{c.label}</p>
            <p className="mt-3 text-3xl font-bold text-brand-dark">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-line bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-brand-dark">Create a quiz with AI</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Give a topic — and optionally paste source material to ground it. The AI
          drafts questions, model answers, and grading rubrics into the item bank as{" "}
          <strong>review</strong>, ready for you to check and publish.
        </p>
        <Link
          href="/admin/generate"
          className="mt-4 inline-block rounded-xl bg-brand px-5 py-3 font-bold text-white hover:bg-brand-dark"
        >
          Open AI Quiz Generator →
        </Link>
      </div>
    </div>
  );
}
