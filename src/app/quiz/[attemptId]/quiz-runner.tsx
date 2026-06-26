"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { submitAttempt } from "../actions";

export type RunnerQuestion = {
  id: string;
  type: string;
  marks: number;
  stem: string;
  section_no: number;
  section_title: string | null;
  options: { key: string; label: string }[];
};

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

export function QuizRunner({
  attemptId,
  questions,
  initialAnswers,
  durationMinutes,
  startedAt,
}: {
  attemptId: string;
  questions: RunnerQuestion[];
  initialAnswers: Record<string, string>;
  durationMinutes: number | null;
  startedAt: string;
}) {
  const supabase = createClient();
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [remaining, setRemaining] = useState<number | null>(null);

  function save(questionId: string, value: string) {
    setAnswers((a) => ({ ...a, [questionId]: value }));
    clearTimeout(timers.current[questionId]);
    timers.current[questionId] = setTimeout(async () => {
      setSaving(true);
      await supabase
        .from("attempt_answers")
        .upsert(
          { attempt_id: attemptId, question_id: questionId, answer: value },
          { onConflict: "attempt_id,question_id" },
        );
      setSaving(false);
    }, 600);
  }

  useEffect(() => {
    if (!durationMinutes) return;
    const deadline = new Date(startedAt).getTime() + durationMinutes * 60_000;
    const tick = () => {
      const r = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setRemaining(r);
      if (r === 0) startTransition(() => submitAttempt(attemptId));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMinutes, startedAt, attemptId]);

  const sections = Array.from(new Set(questions.map((q) => q.section_no))).sort(
    (a, b) => a - b,
  );
  const answeredCount = questions.filter(
    (q) => (answers[q.id] ?? "").trim() !== "",
  ).length;

  return (
    <div className="mt-6">
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
                {qs.map((q, i) => (
                  <div
                    key={q.id}
                    className="rounded-2xl border border-line bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-ink">
                        {i + 1}. {q.stem}
                      </p>
                      <span className="shrink-0 rounded-full bg-canvas px-2.5 py-1 text-xs font-bold text-muted">
                        {q.marks} mark{q.marks > 1 ? "s" : ""}
                      </span>
                    </div>

                    {q.type === "mcq" && (
                      <div className="mt-3 space-y-2">
                        {q.options.map((o) => (
                          <label
                            key={o.key}
                            className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 hover:bg-canvas"
                          >
                            <input
                              type="radio"
                              name={q.id}
                              value={o.key}
                              checked={answers[q.id] === o.key}
                              onChange={() => save(q.id, o.key)}
                            />
                            <span className="text-sm text-ink">
                              {o.key}. {o.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}

                    {q.type === "true_false" && (
                      <div className="mt-3 flex gap-3">
                        {["true", "false"].map((v) => (
                          <label
                            key={v}
                            className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-4 py-2 hover:bg-canvas"
                          >
                            <input
                              type="radio"
                              name={q.id}
                              value={v}
                              checked={answers[q.id] === v}
                              onChange={() => save(q.id, v)}
                            />
                            <span className="text-sm font-semibold capitalize text-ink">
                              {v}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}

                    {q.type === "short" && (
                      <input
                        defaultValue={answers[q.id] ?? ""}
                        onChange={(e) => save(q.id, e.target.value)}
                        placeholder="Your answer…"
                        className="mt-3 w-full rounded-xl border border-line px-4 py-2.5 outline-none focus:border-brand-accent"
                      />
                    )}

                    {q.type === "long" && (
                      <textarea
                        defaultValue={answers[q.id] ?? ""}
                        onChange={(e) => save(q.id, e.target.value)}
                        rows={5}
                        placeholder="Write your answer…"
                        className="mt-3 w-full rounded-xl border border-line px-4 py-2.5 outline-none focus:border-brand-accent"
                      />
                    )}
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="sticky bottom-0 mt-8 flex items-center justify-between gap-3 rounded-2xl border border-line bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="text-sm text-muted">
          {answeredCount}/{questions.length} answered{" "}
          {saving ? (
            <span className="text-brand">· saving…</span>
          ) : (
            <span className="text-green-600">· saved</span>
          )}
          {remaining !== null && (
            <span
              className={`ml-3 font-bold ${remaining < 60 ? "text-red-600" : "text-ink"}`}
            >
              ⏱ {fmt(remaining)}
            </span>
          )}
        </div>
        <button
          onClick={() => startTransition(() => submitAttempt(attemptId))}
          disabled={pending}
          className="rounded-xl bg-brand px-6 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit quiz"}
        </button>
      </div>
    </div>
  );
}
