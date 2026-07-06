"use client";

import { useActionState } from "react";
import { generateQuizAction, type GenState } from "../actions";

const field =
  "w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-brand-accent";
const label = "mb-1 block text-sm font-semibold text-ink";

export function GenerateForm({
  courses,
}: {
  courses: { id: string; title: string }[];
}) {
  const [state, action, pending] = useActionState<GenState, FormData>(
    generateQuizAction,
    {},
  );

  return (
    <form
      action={action}
      className="mt-6 max-w-2xl space-y-5 rounded-2xl border border-line bg-white p-6 shadow-sm"
    >
      <div>
        <label className={label}>Course</label>
        <select name="course_id" defaultValue="" className={field}>
          <option value="">— New course (enter title below) —</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={label}>
          New course title{" "}
          <span className="font-normal text-muted">(only if creating a new course)</span>
        </label>
        <input
          name="new_course_title"
          className={field}
          placeholder="e.g. Cybersecurity Fundamentals"
        />
      </div>

      <div>
        <label className={label}>Quiz title</label>
        <input name="quiz_title" className={field} placeholder="e.g. Module 1 Assessment" />
      </div>

      <div>
        <label className={label}>Topic *</label>
        <input
          name="topic"
          required
          className={field}
          placeholder="e.g. Phishing and social engineering"
        />
      </div>

      <div>
        <label className={label}>
          Knowledge base{" "}
          <span className="font-normal text-muted">
            (optional — paste text and/or upload a document to ground the questions)
          </span>
        </label>
        <textarea
          name="knowledge_base"
          rows={5}
          className={field}
          placeholder="Paste study notes, a syllabus, or reference text…"
        />
        <input
          type="file"
          name="kb_file"
          accept=".pdf,.docx,.txt,.md"
          className="mt-2 block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-1.5 file:font-semibold file:text-white hover:file:bg-brand-dark"
        />
        <p className="mt-1 text-xs text-muted">
          PDF, DOCX, or TXT. Paste and upload can both be used — they&apos;re combined.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className={label}>Difficulty</label>
          <select name="difficulty" defaultValue="medium" className={field}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div>
          <label className={label}>Sections (max 4)</label>
          <input
            name="sections"
            type="number"
            min={1}
            max={4}
            defaultValue={1}
            className={field}
            onChange={(e) => {
              if (Number(e.target.value) > 4) e.target.value = "4";
            }}
            onBlur={(e) => {
              const v = Number(e.target.value) || 1;
              e.target.value = String(Math.min(4, Math.max(1, v)));
            }}
          />
        </div>
        <div>
          <label className={label}>MCQ / sec</label>
          <input name="mcq" type="number" min={0} max={10} defaultValue={5} className={field} />
        </div>
        <div>
          <label className={label}>Short / sec</label>
          <input name="short" type="number" min={0} max={10} defaultValue={2} className={field} />
        </div>
        <div>
          <label className={label}>Long / sec</label>
          <input name="long" type="number" min={0} max={5} defaultValue={1} className={field} />
        </div>
      </div>

      {state?.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <button
        disabled={pending}
        className="rounded-xl bg-brand px-6 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Generating… (can take ~30s)" : "Generate quiz"}
      </button>
      <p className="text-xs text-muted">
        Up to 4 sections (the performance report has a 4-row table). Keep question counts
        modest to stay within the request time limit.
      </p>
    </form>
  );
}
