import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { publishQuiz } from "../../actions";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Course — Admin" };

type Quiz = {
  id: string;
  title: string;
  status: string;
  total_marks: number;
  quiz_slots: { question_id: string }[] | null;
};

export default async function CourseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, status")
    .eq("id", id)
    .single();
  if (!course) notFound();

  const { data: quizData } = await supabase
    .from("quizzes")
    .select("id, title, status, total_marks, quiz_slots(question_id)")
    .eq("course_id", id)
    .order("created_at");
  const quizzes = (quizData ?? []) as unknown as Quiz[];

  return (
    <div className="max-w-3xl">
      <Link href="/admin/courses" className="text-sm text-brand hover:underline">
        ← All courses
      </Link>
      <div className="mt-2 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-dark">{course.title}</h1>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            course.status === "published"
              ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {course.status}
        </span>
      </div>

      <h2 className="mt-8 text-lg font-bold text-brand-dark">Quizzes</h2>
      {quizzes.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No quizzes yet. Create one from the{" "}
          <Link href="/admin/generate" className="text-brand hover:underline">
            AI Quiz Generator
          </Link>
          .
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {quizzes.map((q) => (
            <div
              key={q.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-5 shadow-sm"
            >
              <div>
                <Link
                  href={`/admin/quizzes/${q.id}`}
                  className="font-bold text-brand-dark hover:text-brand hover:underline"
                >
                  {q.title}
                </Link>
                <p className="mt-0.5 text-xs text-muted">
                  {q.quiz_slots?.length ?? 0} questions · {q.total_marks} marks ·{" "}
                  <span
                    className={
                      q.status === "published"
                        ? "font-semibold text-green-700"
                        : "font-semibold text-amber-700"
                    }
                  >
                    {q.status}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/quizzes/${q.id}`}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark"
                >
                  Edit questions
                </Link>
                {q.status !== "published" && (
                  <form action={publishQuiz.bind(null, q.id)}>
                    <SubmitButton
                      className="rounded-lg border border-line px-3 py-2 text-sm font-bold text-brand hover:bg-canvas"
                      pendingText="Publishing…"
                    >
                      Publish
                    </SubmitButton>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
