"use client";

import { useState } from "react";

export type PreviewQuestion = {
  id: string;
  type: string;
  marks: number;
  stem: string;
  section_no: number;
  section_title: string | null;
  options: { key: string; label: string }[];
};
export type KeyInfo = { correct: string | null; model: string | null };

// Admin-only quiz preview. Pure local state — no attempt, no autosave, no
// grading, nothing persisted. "Finish" just reveals the answer key client-side.
export function PreviewRunner({
  quizTitle,
  totalMarks,
  questions,
  answerKey,
}: {
  quizTitle: string;
  totalMarks: number;
  questions: PreviewQuestion[];
  answerKey: Record<string, KeyInfo>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [finished, setFinished] = useState(false);

  const set = (qid: string, v: string) =>
    setAnswers((a) => ({ ...a, [qid]: v }));
  const finish = () => {
    setFinished(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const reset = () => {
    setAnswers({});
    setFinished(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const eq = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

  const sections = Array.from(new Set(questions.map((q) => q.section_no))).sort((a, b) => a - b);
  const answeredCount = questions.filter((q) => (answers[q.id] ?? "").trim() !== "").length;

  // Auto-gradable in preview = mcq / true_false that have a key.
  const auto = questions.filter(
    (q) => (q.type === "mcq" || q.type === "true_false") && answerKey[q.id]?.correct != null,
  );
  const correctCount = auto.filter((q) => eq(answers[q.id], answerKey[q.id].correct)).length;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-amber-300 bg-amber-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold text-brand-dark">👁 Preview · {quizTitle}</p>
            <p className="text-xs text-amber-700">
              Admin preview — nothing is saved or graded. {answeredCount}/{questions.length} answered ·{" "}
              {totalMarks} marks
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {finished ? (
              <button
                onClick={reset}
                className="rounded-xl border border-amber-400 bg-white px-4 py-2 text-sm font-bold text-amber-700 hover:bg-amber-100"
              >
                Restart
              </button>
            ) : (
              <button
                onClick={finish}
                className="rounded-xl bg-brand px-5 py-2 font-bold text-white hover:bg-brand-dark"
              >
                Finish preview
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-8">
        {finished && (
          <div className="mb-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-brand-dark">Preview summary</h2>
            <p className="mt-1 text-sm text-muted">
              Auto-graded <b>{correctCount}/{auto.length}</b> multiple-choice &amp; true/false correct.
              Free-text answers show the model answer below (no AI grading in preview).{" "}
              <b>Nothing was saved.</b>
            </p>
          </div>
        )}

        <ol className="space-y-6">
          {sections.map((sec) => {
            const qs = questions.filter((q) => q.section_no === sec);
            const title = qs[0]?.section_title;
            return (
              <li key={sec}>
                {(sections.length > 1 || title) && (
                  <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-brand">
                    Section {sec}
                    {title ? ` — ${title}` : ""}
                  </h2>
                )}
                <div className="space-y-4">
                  {qs.map((q, i) => {
                    const key = answerKey[q.id];
                    const mine = answers[q.id] ?? "";
                    const choices =
                      q.type === "true_false"
                        ? [
                            { key: "true", label: "True" },
                            { key: "false", label: "False" },
                          ]
                        : q.options;
                    return (
                      <div key={q.id} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-semibold text-ink">
                            {i + 1}. {q.stem}
                          </p>
                          <span className="shrink-0 rounded-full bg-canvas px-2.5 py-1 text-xs font-bold text-muted">
                            {q.marks} mark{q.marks > 1 ? "s" : ""}
                          </span>
                        </div>

                        {(q.type === "mcq" || q.type === "true_false") && (
                          <div className="mt-3 space-y-2">
                            {choices.map((o) => {
                              const chosen = eq(mine, o.key);
                              const isCorrect = finished && key?.correct != null && eq(key.correct, o.key);
                              const isWrong =
                                finished && chosen && key?.correct != null && !eq(key.correct, o.key);
                              return (
                                <label
                                  key={o.key}
                                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                                    isCorrect
                                      ? "border-green-500 bg-green-50"
                                      : isWrong
                                        ? "border-red-400 bg-red-50"
                                        : "border-line hover:bg-canvas"
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={q.id}
                                    value={o.key}
                                    checked={chosen}
                                    disabled={finished}
                                    onChange={() => set(q.id, o.key)}
                                  />
                                  <span className="text-ink">
                                    {q.type === "mcq" ? `${o.key}. ` : ""}
                                    {o.label}
                                  </span>
                                  {isCorrect && (
                                    <span className="ml-auto text-xs font-bold text-green-700">Correct</span>
                                  )}
                                  {isWrong && (
                                    <span className="ml-auto text-xs font-bold text-red-700">Your pick</span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        )}

                        {q.type === "short" && (
                          <input
                            value={mine}
                            disabled={finished}
                            onChange={(e) => set(q.id, e.target.value)}
                            placeholder="Your answer…"
                            className="mt-3 w-full rounded-xl border border-line px-4 py-2.5 outline-none focus:border-brand-accent disabled:bg-canvas"
                          />
                        )}

                        {q.type === "long" && (
                          <textarea
                            value={mine}
                            disabled={finished}
                            onChange={(e) => set(q.id, e.target.value)}
                            rows={4}
                            placeholder="Write your answer…"
                            className="mt-3 w-full rounded-xl border border-line px-4 py-2.5 outline-none focus:border-brand-accent disabled:bg-canvas"
                          />
                        )}

                        {finished && (q.type === "short" || q.type === "long") && key?.model && (
                          <div className="mt-2 rounded-lg bg-canvas p-3 text-sm">
                            <p className="text-xs font-semibold text-muted">Model answer</p>
                            <p className="mt-1 whitespace-pre-wrap text-ink">{key.model}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-8 flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
          <span className="text-sm text-muted">{answeredCount}/{questions.length} answered · preview only</span>
          {finished ? (
            <button
              onClick={reset}
              className="rounded-xl border border-line px-6 py-3 font-bold text-brand hover:bg-canvas"
            >
              Restart preview
            </button>
          ) : (
            <button
              onClick={finish}
              className="rounded-xl bg-brand px-6 py-3 font-bold text-white hover:bg-brand-dark"
            >
              Finish preview
            </button>
          )}
        </div>
      </div>
    </>
  );
}
