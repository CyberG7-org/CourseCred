import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QuizEditor, type EditorQuestion } from "./quiz-editor";

export const metadata = { title: "Edit quiz — Admin" };
export const maxDuration = 60;

type Key = {
  correct_answer: unknown;
  model_answer: string | null;
  rubric: { points: number; criterion: string }[] | null;
};
type Question = {
  id: string;
  type: string;
  marks: number;
  stem: string;
  section_no: number | null;
  section_title: string | null;
  options: { key: string; label: string }[] | null;
  question_keys: Key | Key[] | null;
};
type Slot = {
  slot_no: number;
  section_no: number | null;
  questions: Question | Question[] | null;
};

function rubricToText(rubric: { points: number; criterion: string }[] | null | undefined) {
  return (rubric ?? []).map((r) => `${r.points} | ${r.criterion}`).join("\n");
}

export default async function QuizEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, pass_mark, status, course_id")
    .eq("id", id)
    .single();
  if (!quiz) notFound();

  const { data: slotData } = await supabase
    .from("quiz_slots")
    .select(
      "slot_no, section_no, questions(id, type, marks, stem, section_no, section_title, options, question_keys(correct_answer, model_answer, rubric))",
    )
    .eq("quiz_id", id)
    .order("slot_no");
  const slots = (slotData ?? []) as unknown as Slot[];

  const questions: EditorQuestion[] = slots
    .map((s): EditorQuestion | null => {
      const q = Array.isArray(s.questions) ? s.questions[0] : s.questions;
      if (!q) return null;
      const key = Array.isArray(q.question_keys) ? q.question_keys[0] : q.question_keys;
      return {
        id: q.id,
        type: q.type,
        marks: q.marks,
        stem: q.stem,
        section_no: q.section_no ?? s.section_no ?? 1,
        section_title: q.section_title ?? "",
        options: q.options ?? [],
        correct: String(key?.correct_answer ?? ""),
        model_answer: key?.model_answer ?? "",
        rubric: rubricToText(key?.rubric),
      };
    })
    .filter((q): q is EditorQuestion => q !== null);

  return (
    <QuizEditor
      quizId={quiz.id}
      courseId={quiz.course_id}
      title={quiz.title}
      status={quiz.status}
      passMark={quiz.pass_mark}
      questions={questions}
    />
  );
}
