import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PreviewRunner, type PreviewQuestion, type KeyInfo } from "./preview-runner";

export const metadata = { title: "Preview quiz — Admin" };

type QEmbed = {
  id: string;
  type: string;
  marks: number;
  stem: string;
  section_title: string | null;
  options: { key: string; label: string }[] | null;
};
type SlotEmbed = { slot_no: number; section_no: number | null; questions: QEmbed | QEmbed[] | null };

// correct_answer is jsonb: "B" | ["A","C"] | true. Flatten to a comparable string.
function normCorrect(ca: unknown): string | null {
  if (ca == null) return null;
  if (typeof ca === "boolean") return ca ? "true" : "false";
  if (Array.isArray(ca)) return ca.map(String).join(",");
  return String(ca);
}

export default async function QuizPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/admin/quizzes/${id}/preview`);
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") redirect("/dashboard");

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("title, total_marks, course_id, courses(title)")
    .eq("id", id)
    .single();
  if (!quiz) notFound();

  const { data: slotData } = await supabase
    .from("quiz_slots")
    .select("slot_no, section_no, questions(id, type, marks, stem, section_title, options)")
    .eq("quiz_id", id)
    .order("slot_no");
  const slots = (slotData ?? []) as unknown as SlotEmbed[];
  const questions: PreviewQuestion[] = slots
    .map((s) => {
      const q = Array.isArray(s.questions) ? s.questions[0] : s.questions;
      if (!q) return null;
      return {
        id: q.id,
        type: q.type,
        marks: q.marks,
        stem: q.stem,
        section_no: s.section_no ?? 1,
        section_title: q.section_title,
        options: q.options ?? [],
      };
    })
    .filter((q): q is PreviewQuestion => q !== null);

  // Answer keys — admin-only, revealed when they finish the preview.
  const answerKey: Record<string, KeyInfo> = {};
  const ids = questions.map((q) => q.id);
  if (ids.length) {
    const { data: keys } = await supabase
      .from("question_keys")
      .select("question_id, correct_answer, model_answer")
      .in("question_id", ids);
    for (const k of (keys ?? []) as {
      question_id: string;
      correct_answer: unknown;
      model_answer: string | null;
    }[]) {
      answerKey[k.question_id] = { correct: normCorrect(k.correct_answer), model: k.model_answer };
    }
  }

  const courseEmbed = (quiz as { courses?: { title: string } | { title: string }[] }).courses;
  const course = Array.isArray(courseEmbed) ? courseEmbed[0] : courseEmbed;

  return (
    <div className="-m-8">
      <div className="mx-auto max-w-3xl px-5 pt-5">
        <Link
          href={`/admin/courses/${quiz.course_id}`}
          className="text-sm text-brand hover:underline"
        >
          ← Back to {course?.title ?? "course"}
        </Link>
      </div>
      <PreviewRunner
        quizTitle={quiz.title}
        totalMarks={quiz.total_marks ?? 0}
        questions={questions}
        answerKey={answerKey}
      />
    </div>
  );
}
