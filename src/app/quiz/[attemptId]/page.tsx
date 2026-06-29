import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QuizRunner, type RunnerQuestion } from "./quiz-runner";

export const maxDuration = 60;
export const metadata = { title: "Take quiz — CourseCred" };

type QEmbed = {
  id: string;
  type: string;
  marks: number;
  stem: string;
  section_title: string | null;
  options: { key: string; label: string }[] | null;
};
type SlotEmbed = {
  slot_no: number;
  section_no: number | null;
  questions: QEmbed | QEmbed[] | null;
};

export default async function QuizPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/quiz/${attemptId}`);

  const { data: attempt } = await supabase
    .from("attempts")
    .select("id, user_id, quiz_id, state, started_at")
    .eq("id", attemptId)
    .single();
  if (!attempt || attempt.user_id !== user.id) notFound();
  if (attempt.state !== "in_progress") redirect(`/results/${attemptId}`);

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("title, total_marks, duration_minutes")
    .eq("id", attempt.quiz_id)
    .single();

  const { data: slotData } = await supabase
    .from("quiz_slots")
    .select("slot_no, section_no, questions(id, type, marks, stem, section_title, options)")
    .eq("quiz_id", attempt.quiz_id)
    .order("slot_no");
  const slots = (slotData ?? []) as unknown as SlotEmbed[];

  const questions: RunnerQuestion[] = slots
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
    .filter((q): q is RunnerQuestion => q !== null);

  const { data: ansData } = await supabase
    .from("attempt_answers")
    .select("question_id, answer")
    .eq("attempt_id", attemptId);
  const initialAnswers: Record<string, string> = {};
  for (const a of ansData ?? []) {
    initialAnswers[a.question_id] =
      typeof a.answer === "string" ? a.answer : String(a.answer ?? "");
  }

  return (
    <main className="min-h-screen bg-canvas">
      <QuizRunner
        attemptId={attemptId}
        quizTitle={quiz?.title ?? "Quiz"}
        totalMarks={quiz?.total_marks ?? 0}
        questions={questions}
        initialAnswers={initialAnswers}
        durationMinutes={quiz?.duration_minutes ?? 90}
        startedAt={attempt.started_at}
      />
    </main>
  );
}
