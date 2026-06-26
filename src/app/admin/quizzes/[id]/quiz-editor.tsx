"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import {
  saveAllQuestions,
  addQuestion,
  deleteQuestion,
  publishQuiz,
  unpublishQuiz,
  aiAddQuestions,
  type GenState,
} from "../../actions";

const field =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand-accent";
const fieldSm =
  "rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand-accent";
const lbl = "text-xs font-semibold text-muted";

export type EditorQuestion = {
  id: string;
  type: string;
  marks: number;
  stem: string;
  section_no: number;
  section_title: string;
  options: { key: string; label: string }[];
  correct: string;
  model_answer: string;
  rubric: string;
};

const TYPES = (
  <>
    <option value="mcq">MCQ</option>
    <option value="true_false">True / False</option>
    <option value="short">Short answer</option>
    <option value="long">Long answer</option>
  </>
);

export function QuizEditor({
  quizId,
  courseId,
  title,
  status,
  passMark,
  questions,
}: {
  quizId: string;
  courseId: string;
  title: string;
  status: string;
  passMark: number;
  questions: EditorQuestion[];
}) {
  const [marks, setMarks] = useState<Record<string, number>>(
    Object.fromEntries(questions.map((q) => [q.id, q.marks])),
  );
  const [types, setTypes] = useState<Record<string, string>>(
    Object.fromEntries(questions.map((q) => [q.id, q.type])),
  );

  const total = useMemo(
    () => questions.reduce((sum, q) => sum + (Number(marks[q.id] ?? q.marks) || 0), 0),
    [marks, questions],
  );
  const totalOk = total === 100;

  function setMark(id: string, val: number) {
    setMarks((m) => ({ ...m, [id]: val }));
  }

  function evenSplit() {
    const n = questions.length;
    if (!n) return;
    const base = Math.floor(100 / n);
    let rem = 100 - base * n;
    const next: Record<string, number> = {};
    for (const q of questions) {
      next[q.id] = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
    }
    setMarks(next);
  }

  function scaleTo100() {
    const ids = questions.map((q) => q.id);
    const cur = questions.map((q) => marks[q.id] ?? q.marks);
    const sum = cur.reduce((a, b) => a + b, 0);
    if (sum === 0) return evenSplit();
    const factor = 100 / sum;
    const scaled = cur.map((m) => Math.max(1, Math.round(m * factor)));
    let diff = 100 - scaled.reduce((a, b) => a + b, 0);
    const order = scaled.map((_, i) => i).sort((a, b) => scaled[b] - scaled[a]);
    let k = 0;
    while (diff !== 0 && k < 5000) {
      const idx = order[k % order.length];
      if (diff > 0) {
        scaled[idx]++;
        diff--;
      } else if (scaled[idx] > 1) {
        scaled[idx]--;
        diff++;
      }
      k++;
    }
    const next: Record<string, number> = {};
    ids.forEach((id, i) => (next[id] = scaled[i]));
    setMarks(next);
  }

  return (
    <div className="max-w-3xl">
      <Link href={`/admin/courses/${courseId}`} className="text-sm text-brand hover:underline">
        ← Back to course
      </Link>

      <form id="questions-form" action={saveAllQuestions.bind(null, quizId)}>
        <input type="hidden" name="qids" value={questions.map((q) => q.id).join(",")} />

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-brand-dark">{title}</h1>
            <p className="mt-1 text-sm text-muted">
              <span className={totalOk ? "font-bold text-green-700" : "font-bold text-amber-700"}>
                {total} / 100 marks
              </span>{" "}
              · pass {passMark} ·{" "}
              <span
                className={
                  status === "published" ? "font-bold text-green-700" : "font-bold text-amber-700"
                }
              >
                {status}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SubmitButton
              className="rounded-xl bg-brand px-5 py-2.5 font-bold text-white hover:bg-brand-dark"
              pendingText="Saving…"
            >
              Save all
            </SubmitButton>
            {status === "published" ? (
              <button
                formAction={unpublishQuiz.bind(null, quizId)}
                formNoValidate
                className="rounded-xl border border-line px-5 py-2.5 font-bold text-brand hover:bg-canvas"
              >
                Unpublish
              </button>
            ) : (
              <button
                formAction={publishQuiz.bind(null, quizId)}
                formNoValidate
                className="rounded-xl border border-line px-5 py-2.5 font-bold text-brand hover:bg-canvas"
              >
                Publish
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            Marks are per-question weights — make them total <b>100</b>. Pass mark is half the
            total. Answer keys stay hidden from candidates.
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={scaleTo100}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
              title="Keep the relative weighting (harder questions worth more) and rescale so the total is 100"
            >
              Scale to 100
            </button>
            <button
              type="button"
              onClick={evenSplit}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
              title="Give every question an equal share of 100"
            >
              Even split
            </button>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {questions.length === 0 && (
            <p className="text-sm text-muted">No questions yet — add one below.</p>
          )}
          {questions.map((q, i) => {
            const sfx = `__${q.id}`;
            const type = types[q.id] ?? q.type;
            const correct = q.correct.replace(/^"|"$/g, "");
            const optLabel = (k: string) => q.options.find((o) => o.key === k)?.label ?? "";
            return (
              <div key={q.id} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-end gap-3">
                  <span className="pb-2 text-sm font-bold text-muted">#{i + 1}</span>
                  <label className={lbl}>
                    Type
                    <select
                      name={`type${sfx}`}
                      value={type}
                      onChange={(e) => setTypes((t) => ({ ...t, [q.id]: e.target.value }))}
                      className={`${fieldSm} mt-1 block`}
                    >
                      {TYPES}
                    </select>
                  </label>
                  <label className={lbl}>
                    Marks
                    <input
                      name={`marks${sfx}`}
                      type="number"
                      min={1}
                      max={100}
                      value={marks[q.id] ?? q.marks}
                      onChange={(e) => setMark(q.id, Number(e.target.value) || 0)}
                      className={`${fieldSm} mt-1 block w-24`}
                    />
                  </label>
                  <label className={lbl}>
                    Section
                    <input
                      name={`section_no${sfx}`}
                      type="number"
                      min={1}
                      defaultValue={q.section_no}
                      className={`${fieldSm} mt-1 block w-20`}
                    />
                  </label>
                  <label className={`${lbl} flex-1`}>
                    Section title
                    <input
                      name={`section_title${sfx}`}
                      defaultValue={q.section_title}
                      placeholder="(optional)"
                      className={`${field} mt-1`}
                    />
                  </label>
                </div>

                <textarea
                  name={`stem${sfx}`}
                  defaultValue={q.stem}
                  rows={2}
                  placeholder="Question text…"
                  className={`${field} mt-3`}
                />

                {type === "mcq" && (
                  <div className="mt-3 space-y-2">
                    {["A", "B", "C", "D"].map((k) => (
                      <div key={k} className="flex items-center gap-2">
                        <label className="flex w-10 items-center gap-1 text-sm font-bold text-ink">
                          <input
                            type="radio"
                            name={`correct${sfx}`}
                            value={k}
                            defaultChecked={correct === k}
                          />
                          {k}
                        </label>
                        <input
                          name={`opt_${k}${sfx}`}
                          defaultValue={optLabel(k)}
                          placeholder={`Option ${k}`}
                          className={`${field} flex-1`}
                        />
                      </div>
                    ))}
                    <p className="text-xs text-muted">Select the radio next to the correct option.</p>
                  </div>
                )}

                {type === "true_false" && (
                  <div className="mt-3 flex gap-4">
                    {["true", "false"].map((v) => (
                      <label
                        key={v}
                        className="flex items-center gap-1.5 text-sm font-semibold capitalize text-ink"
                      >
                        <input
                          type="radio"
                          name={`correct${sfx}`}
                          value={v}
                          defaultChecked={correct === v}
                        />
                        {v}
                      </label>
                    ))}
                  </div>
                )}

                {(type === "short" || type === "long") && (
                  <>
                    <textarea
                      name={`model_answer${sfx}`}
                      defaultValue={q.model_answer}
                      rows={2}
                      placeholder="Model answer…"
                      className={`${field} mt-3`}
                    />
                    <textarea
                      name={`rubric${sfx}`}
                      defaultValue={q.rubric}
                      rows={3}
                      placeholder={"Rubric — one per line:  points | criterion"}
                      className={`${field} mt-2 font-mono`}
                    />
                    <p className="mt-1 text-xs text-muted">
                      Rubric points should sum to this question&apos;s marks ({marks[q.id] ?? q.marks}).
                    </p>
                  </>
                )}

                <button
                  type="submit"
                  formAction={deleteQuestion.bind(null, q.id, quizId)}
                  formNoValidate
                  className="mt-3 text-xs font-semibold text-red-600 hover:underline"
                >
                  Delete question
                </button>
              </div>
            );
          })}
        </div>
      </form>

      <h2 className="mb-3 mt-10 text-lg font-bold text-brand-dark">Add questions</h2>
      <AiAddForm quizId={quizId} courseId={courseId} defaultTopic={title} />
      <p className="my-4 text-center text-xs font-semibold uppercase tracking-wide text-muted">
        — or write one manually —
      </p>
      <AddQuestion quizId={quizId} courseId={courseId} />
    </div>
  );
}

function AddQuestion({ quizId, courseId }: { quizId: string; courseId: string }) {
  const [type, setType] = useState("mcq");
  return (
    <form
      action={addQuestion.bind(null, quizId, courseId)}
      className="space-y-3 rounded-2xl border border-line bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className={lbl}>
          Type
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={`${fieldSm} mt-1 block`}
          >
            {TYPES}
          </select>
        </label>
        <label className={lbl}>
          Marks
          <input
            name="marks"
            type="number"
            min={1}
            max={100}
            defaultValue={1}
            className={`${fieldSm} mt-1 block w-24`}
          />
        </label>
        <label className={lbl}>
          Section
          <input
            name="section_no"
            type="number"
            min={1}
            defaultValue={1}
            className={`${fieldSm} mt-1 block w-20`}
          />
        </label>
        <label className={`${lbl} flex-1`}>
          Section title
          <input name="section_title" placeholder="(optional)" className={`${field} mt-1`} />
        </label>
      </div>

      <textarea name="stem" rows={2} required placeholder="Question text…" className={field} />

      {type === "mcq" && (
        <div className="space-y-2">
          {["A", "B", "C", "D"].map((k) => (
            <div key={k} className="flex items-center gap-2">
              <label className="flex w-10 items-center gap-1 text-sm font-bold text-ink">
                <input type="radio" name="correct" value={k} defaultChecked={k === "A"} />
                {k}
              </label>
              <input name={`opt_${k}`} placeholder={`Option ${k}`} className={`${field} flex-1`} />
            </div>
          ))}
        </div>
      )}

      {type === "true_false" && (
        <div className="flex gap-4">
          {["true", "false"].map((v) => (
            <label
              key={v}
              className="flex items-center gap-1.5 text-sm font-semibold capitalize text-ink"
            >
              <input type="radio" name="correct" value={v} defaultChecked={v === "true"} />
              {v}
            </label>
          ))}
        </div>
      )}

      {(type === "short" || type === "long") && (
        <>
          <textarea name="model_answer" rows={2} placeholder="Model answer…" className={field} />
          <textarea
            name="rubric"
            rows={3}
            placeholder={"Rubric — one per line:  points | criterion"}
            className={`${field} font-mono`}
          />
        </>
      )}

      <SubmitButton
        className="rounded-xl bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-dark"
        pendingText="Adding…"
      >
        Add question
      </SubmitButton>
    </form>
  );
}

function AiAddForm({
  quizId,
  courseId,
  defaultTopic,
}: {
  quizId: string;
  courseId: string;
  defaultTopic: string;
}) {
  const [state, action, pending] = useActionState<GenState, FormData>(
    aiAddQuestions.bind(null, quizId, courseId),
    {},
  );
  return (
    <form
      action={action}
      className="space-y-3 rounded-2xl border-2 border-brand-accent bg-white p-5 shadow-sm"
    >
      <p className="text-sm font-bold text-brand-dark">✨ Generate with AI</p>

      <div className="flex flex-wrap items-end gap-3">
        <label className={`${lbl} min-w-48 flex-1`}>
          Topic
          <input
            name="topic"
            defaultValue={defaultTopic}
            required
            placeholder="e.g. Network security basics"
            className={`${field} mt-1`}
          />
        </label>
        <label className={lbl}>
          Difficulty
          <select name="difficulty" defaultValue="medium" className={`${fieldSm} mt-1 block`}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className={lbl}>
          MCQ
          <input
            name="mcq"
            type="number"
            min={0}
            max={10}
            defaultValue={3}
            className={`${fieldSm} mt-1 block w-20`}
          />
        </label>
        <label className={lbl}>
          Short
          <input
            name="short"
            type="number"
            min={0}
            max={10}
            defaultValue={0}
            className={`${fieldSm} mt-1 block w-20`}
          />
        </label>
        <label className={lbl}>
          Long
          <input
            name="long"
            type="number"
            min={0}
            max={5}
            defaultValue={0}
            className={`${fieldSm} mt-1 block w-20`}
          />
        </label>
      </div>

      <label className={lbl}>
        Knowledge base <span className="font-normal">(optional — ground the questions)</span>
        <textarea
          name="knowledge_base"
          rows={3}
          placeholder="Paste source material…"
          className={`${field} mt-1`}
        />
      </label>

      {state?.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</div>
      )}

      <button
        disabled={pending}
        className="rounded-xl bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:cursor-progress disabled:opacity-70"
      >
        {pending ? "Generating… (~30s)" : "✨ Generate & add"}
      </button>
      <p className="text-xs text-muted">
        New questions are appended for review. Re-balance marks to 100 and click <b>Save all</b>.
      </p>
    </form>
  );
}
