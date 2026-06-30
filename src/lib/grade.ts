import { createServiceClient } from "@/lib/supabase/service";
import { gradeFreeText, type FreeTextItem } from "@/lib/anthropic";
import { sendResultToN8n } from "@/lib/notify";
import { renderUpgradeHtml } from "@/lib/tiers";

function norm(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/^"|"$/g, "");
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const s = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
    .select("id, quiz_id, candidate_code, user_id, started_at, submitted_at")
    .eq("id", attemptId)
    .single();
  if (!attempt) throw new Error("Attempt not found");

  const { data: quiz } = await svc
    .from("quizzes")
    .select("title, total_marks, pass_mark, courses(title)")
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
    attempt.candidate_code ?? "CC-" + Math.random().toString(36).slice(2, 8).toUpperCase();

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

  // Hand off to n8n for email delivery (no-ops if the webhook isn't set yet).
  const { data: authUser } = await svc.auth.admin.getUserById(attempt.user_id);
  const { data: prof } = await svc
    .from("profiles")
    .select("full_name")
    .eq("id", attempt.user_id)
    .single();
  const courseEmbed = (
    quiz as { courses?: { title: string | null } | { title: string | null }[] } | null
  )?.courses;
  const course = Array.isArray(courseEmbed) ? courseEmbed[0] : courseEmbed;
  const email = authUser?.user?.email ?? "";

  // Current tier for this attempt (free = 1, raised by Stripe entitlements).
  const { data: ents } = await svc.from("entitlements").select("tier").eq("attempt_id", attemptId);
  const tier = (ents ?? []).reduce((m: number, e: { tier: number }) => Math.max(m, e.tier ?? 1), 1);

  await sendResultToN8n({
    candidate_id: code,
    email,
    name: prof?.full_name ?? "",
    course: course?.title ?? "",
    quiz: (quiz as { title?: string | null } | null)?.title ?? "",
    score,
    max_score: maxScore,
    percentage: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
    passed,
    band,
    started_at: attempt.started_at ?? null,
    submitted_at: attempt.submitted_at ?? null,
    duration: formatDuration(attempt.started_at, attempt.submitted_at),
    date: formatDate(attempt.submitted_at),
    tier,
    upgrade_html: renderUpgradeHtml(tier, code, email),
  });

  // Reveal the result in the candidate + admin portals (post-delivery).
  await svc.from("attempts").update({ result_sent_at: new Date().toISOString() }).eq("id", attemptId);

  return { score, maxScore, passed };
}
