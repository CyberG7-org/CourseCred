import { createServiceClient } from "@/lib/supabase/service";
import { gradeFreeText, type FreeTextItem } from "@/lib/anthropic";

function norm(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/^"|"$/g, "");
}

type KeyRow = {
  correct_answer: unknown;
  model_answer: string | null;
  rubric: { points: number; criterion: string }[] | null;
};
type QRow = {
  id: string;
  type: string;
  marks: number;
  stem: string;
  question_keys: KeyRow | KeyRow[] | null;
};
type SlotRow = { question_id: string; questions: QRow | QRow[] | null };

type GradeRow = {
  attempt_id: string;
  question_id: string;
  awarded_marks: number;
  max_marks: number;
  rationale: string;
  needs_review: boolean;
  grader_model: string | null;
};

export async function gradeAttempt(attemptId: string) {
  const svc = createServiceClient();

  const { data: attempt } = await svc
    .from("attempts")
    .select("id, quiz_id, candidate_code")
    .eq("id", attemptId)
    .single();
  if (!attempt) throw new Error("Attempt not found");

  const { data: quiz } = await svc
    .from("quizzes")
    .select("total_marks, pass_mark")
    .eq("id", attempt.quiz_id)
    .single();

  const { data: slotData } = await svc
    .from("quiz_slots")
    .select(
      "question_id, questions(id, type, marks, stem, question_keys(correct_answer, model_answer, rubric))",
    )
    .eq("quiz_id", attempt.quiz_id);
  const slots = (slotData ?? []) as unknown as SlotRow[];

  const { data: ansData } = await svc
    .from("attempt_answers")
    .select("question_id, answer")
    .eq("attempt_id", attemptId);
  const ansMap = new Map(
    (ansData ?? []).map((a: { question_id: string; answer: unknown }) => [
      a.question_id,
      typeof a.answer === "string" ? a.answer : String(a.answer ?? ""),
    ]),
  );

  const grades: GradeRow[] = [];
  const freeText: FreeTextItem[] = [];

  for (const s of slots) {
    const q = Array.isArray(s.questions) ? s.questions[0] : s.questions;
    if (!q) continue;
    const key = Array.isArray(q.question_keys) ? q.question_keys[0] : q.question_keys;
    const ans = ansMap.get(q.id) ?? "";

    if (q.type === "mcq" || q.type === "true_false") {
      const correct = norm(ans) !== "" && norm(key?.correct_answer) === norm(ans);
      grades.push({
        attempt_id: attemptId,
        question_id: q.id,
        awarded_marks: correct ? q.marks : 0,
        max_marks: q.marks,
        rationale: correct ? "Correct" : "Incorrect",
        needs_review: false,
        grader_model: null,
      });
    } else {
      freeText.push({
        question_id: q.id,
        stem: q.stem,
        marks: q.marks,
        model_answer: key?.model_answer ?? "",
        rubric: key?.rubric ?? [],
        answer: ans,
      });
    }
  }

  if (freeText.length) {
    const ft = await gradeFreeText(freeText);
    const ftMap = new Map(ft.map((g) => [g.question_id, g]));
    for (const it of freeText) {
      const g = ftMap.get(it.question_id);
      const awarded = Math.max(0, Math.min(it.marks, Math.round(g?.awarded ?? 0)));
      grades.push({
        attempt_id: attemptId,
        question_id: it.question_id,
        awarded_marks: awarded,
        max_marks: it.marks,
        rationale: g?.rationale ?? "",
        needs_review: false,
        grader_model: "claude-opus-4-8",
      });
    }
  }

  if (grades.length) {
    await svc
      .from("attempt_grades")
      .upsert(grades, { onConflict: "attempt_id,question_id" });
  }

  const score = grades.reduce((sum, g) => sum + g.awarded_marks, 0);
  const maxScore =
    quiz?.total_marks ?? grades.reduce((sum, g) => sum + g.max_marks, 0);
  const passMark = quiz?.pass_mark ?? Math.ceil(maxScore / 2);
  const passed = score >= passMark;
  const ratio = maxScore > 0 ? score / maxScore : 0;
  const band =
    ratio >= 0.8 ? "Excellent" : ratio >= 0.6 ? "Good" : passed ? "Pass" : "Needs improvement";
  const code =
    attempt.candidate_code ?? "EC-" + Math.random().toString(36).slice(2, 8).toUpperCase();

  await svc
    .from("attempts")
    .update({
      state: "graded",
      graded_at: new Date().toISOString(),
      score,
      max_score: maxScore,
      passed,
      performance_band: band,
      candidate_code: code,
    })
    .eq("id", attemptId);

  return { score, maxScore, passed };
}
