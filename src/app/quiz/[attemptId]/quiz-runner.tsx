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

function fmt(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function QuizRunner({
  attemptId,
  quizTitle,
  totalMarks,
  questions,
  initialAnswers,
  durationMinutes,
  startedAt,
}: {
  attemptId: string;
  quizTitle: string;
  totalMarks: number;
  questions: RunnerQuestion[];
  initialAnswers: Record<string, string>;
  durationMinutes: number | null;
  startedAt: string;
}) {
  const supabase = createClient();
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, startTransition] = useTransition();
  const [remaining, setRemaining] = useState<number | null>(null);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const answersRef = useRef(initialAnswers);
  const submittingRef = useRef(false);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

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

  // Persist everything still in flight, then submit. Used by the button and by
  // the timeout — so a timed-out quiz is saved in full before auto-submitting.
  async function flushAndSubmit(fromTimer = false) {
    if (submittingRef.current) return;
    if (
      !fromTimer &&
      !window.confirm("Submit your quiz now? You won't be able to change your answers.")
    ) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);

    Object.values(timers.current).forEach(clearTimeout);
    const rows = Object.entries(answersRef.current)
      .filter(([, v]) => (v ?? "").trim() !== "")
      .map(([question_id, answer]) => ({ attempt_id: attemptId, question_id, answer }));
    if (rows.length) {
      await supabase.from("attempt_answers").upsert(rows, { onConflict: "attempt_id,question_id" });
    }

    startTransition(() => submitAttempt(attemptId));
  }

  // Countdown — deadline is absolute (start + duration), so reload/resume keeps
  // the same clock. Hitting zero auto-saves + auto-submits.
  useEffect(() => {
    if (!durationMinutes) return;
    const deadline = new Date(startedAt).getTime() + durationMinutes * 60_000;
    const tick = () => {
      const r = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setRemaining(r);
      if (r === 0) flushAndSubmit(true);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMinutes, startedAt, attemptId]);

  const sections = Array.from(new Set(questions.map((q) => q.section_no))).sort((a, b) => a - b);
  const answeredCount = questions.filter((q) => (answers[q.id] ?? "").trim() !== "").length;
  const low = remaining !== null && remaining <= 300; // under 5 minutes
  const busy = submitting || pending;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold text-brand-dark">{quizTitle}</p>
            <p className="text-xs text-muted">
              {answeredCount}/{questions.length} answered · {totalMarks} marks{" "}
              {saving ? (
                <span className="text-brand">· saving…</span>
              ) : (
                <span className="text-green-600">· saved</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {remaining !== null && (
              <div
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-lg font-bold tabular-nums ${
                  low ? "animate-pulse bg-red-100 text-red-700" : "bg-canvas text-brand-dark"
                }`}
                title="Time remaining"
              >
                <span aria-hidden>⏱</span>
                {fmt(remaining)}
              </div>
            )}
            <button
              onClick={() => flushAndSubmit(false)}
              disabled={busy}
              className="rounded-xl bg-brand px-5 py-2 font-bold text-white hover:bg-brand-dark disabled:cursor-progress disabled:opacity-70"
            >
              {busy ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
        {low && (
          <div className="bg-red-600 px-5 py-1 text-center text-xs font-semibold text-white">
            Less than 5 minutes left — the quiz auto-submits when the timer reaches zero.
          </div>
        )}
      </header>

      <div className="mx-auto max-w-3xl px-5 py-8">
        <p className="text-sm text-muted">
          Answer the questions below — your answers save automatically. You have{" "}
          {durationMinutes
            ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
            : "no time limit"}{" "}
          to finish.
        </p>

        <ol className="mt-6 space-y-6">
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
                              <span className="text-sm font-semibold capitalize text-ink">{v}</span>
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

        <div className="mt-8 flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
          <span className="text-sm text-muted">
            {answeredCount}/{questions.length} answered
          </span>
          <button
            onClick={() => flushAndSubmit(false)}
            disabled={busy}
            className="rounded-xl bg-brand px-6 py-3 font-bold text-white hover:bg-brand-dark disabled:cursor-progress disabled:opacity-70"
          >
            {busy ? "Submitting…" : "Submit quiz"}
          </button>
        </div>
      </div>
    </>
  );
}
