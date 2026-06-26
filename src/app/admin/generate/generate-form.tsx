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
            (optional — paste source material to ground the questions)
          </span>
        </label>
        <textarea
          name="knowledge_base"
          rows={6}
          className={field}
          placeholder="Paste study notes, a syllabus, or reference text…"
        />
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
          <label className={label}>Sections</label>
          <input name="sections" type="number" min={1} max={4} defaultValue={1} className={field} />
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
        Keep it to 1–2 sections to stay within the request time limit — generate more
        sections as separate quizzes if needed.
      </p>
    </form>
  );
}
