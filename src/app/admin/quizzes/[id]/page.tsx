import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { publishQuiz } from "../../actions";

export const metadata = { title: "Review quiz — Admin" };

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
  options: { key: string; label: string }[] | null;
  question_keys: Key | Key[] | null;
};
type Slot = { slot_no: number; section_no: number | null; questions: Question | null };

export default async function ReviewQuiz({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, total_marks, pass_mark, status")
    .eq("id", id)
    .single();
  if (!quiz) notFound();

  const { data: slotData } = await supabase
    .from("quiz_slots")
    .select(
      "slot_no, section_no, questions(id, type, marks, stem, options, question_keys(correct_answer, model_answer, rubric))",
    )
    .eq("quiz_id", id)
    .order("slot_no");
  const slots = (slotData ?? []) as unknown as Slot[];

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">{quiz.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {quiz.total_marks} marks · pass {quiz.pass_mark} ·{" "}
            <span
              className={`font-bold ${
                quiz.status === "published" ? "text-green-700" : "text-amber-700"
              }`}
            >
              {quiz.status}
            </span>
          </p>
        </div>
        {quiz.status !== "published" && (
          <form action={publishQuiz.bind(null, quiz.id)}>
            <button className="rounded-xl bg-brand px-5 py-2.5 font-bold text-white hover:bg-brand-dark">
              Publish quiz
            </button>
          </form>
        )}
      </div>

      <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Review the AI-drafted questions and answer keys below. Publishing makes the
        questions visible to candidates — the answer keys stay hidden (enforced by the
        database).
      </p>

      <ol className="mt-6 space-y-4">
        {slots.map((s) => {
          const q = s.questions;
          if (!q) return null;
          const key = Array.isArray(q.question_keys)
            ? q.question_keys[0]
            : q.question_keys;
          const correctKey = String(key?.correct_answer ?? "").replace(/"/g, "");
          return (
            <li key={q.id} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-bold text-brand">
                  {q.type} · {q.marks} mark{q.marks > 1 ? "s" : ""}
                </span>
                <span className="text-xs text-muted">
                  #{s.slot_no} · section {s.section_no}
                </span>
              </div>
              <p className="mt-3 font-semibold text-ink">{q.stem}</p>

              {q.options && q.options.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {q.options.map((o) => {
                    const correct = correctKey === o.key;
                    return (
                      <li
                        key={o.key}
                        className={correct ? "font-bold text-green-700" : "text-ink"}
                      >
                        {o.key}. {o.label}
                        {correct ? "  ✓" : ""}
                      </li>
                    );
                  })}
                </ul>
              )}

              {key?.model_answer && (
                <div className="mt-3 rounded-lg bg-canvas p-3 text-sm">
                  <p className="font-semibold text-brand-dark">Model answer</p>
                  <p className="mt-1 text-muted">{key.model_answer}</p>
                </div>
              )}

              {key?.rubric && key.rubric.length > 0 && (
                <div className="mt-2 text-sm">
                  <p className="font-semibold text-brand-dark">Rubric</p>
                  <ul className="mt-1 list-disc pl-5 text-muted">
                    {key.rubric.map((r, i) => (
                      <li key={i}>
                        ({r.points}) {r.criterion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
