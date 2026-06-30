"use client";

import { useMemo, useState } from "react";
import { LocalTime } from "@/components/local-time";

export type ResultRow = {
  id: string;
  name: string;
  email: string;
  quizTitle: string;
  courseTitle: string;
  candidateCode: string;
  state: string;
  passed: boolean | null;
  score: number | null;
  maxScore: number | null;
  startedAt: string;
  submittedAt: string | null;
  durationLabel: string;
  resultSentAt: string | null;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "in_progress", label: "In progress" },
  { key: "submitted", label: "Submitted" },
  { key: "passed", label: "Passed" },
  { key: "failed", label: "Failed" },
] as const;

function StatusBadge({ state, passed }: { state: string; passed: boolean | null }) {
  const cls =
    state === "graded"
      ? passed
        ? "bg-green-100 text-green-700"
        : "bg-red-100 text-red-700"
      : state === "submitted"
        ? "bg-blue-100 text-blue-700"
        : "bg-amber-100 text-amber-700";
  const label = state === "graded" ? (passed ? "passed" : "failed") : state.replace("_", " ");
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>{label}</span>;
}

export function ResultsTable({ rows }: { rows: ResultRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "in_progress" && r.state !== "in_progress") return false;
      if (filter === "submitted" && r.state !== "submitted") return false;
      if (filter === "passed" && !(r.state === "graded" && r.passed)) return false;
      if (filter === "failed" && !(r.state === "graded" && r.passed === false)) return false;
      if (!needle) return true;
      return [r.name, r.email, r.quizTitle, r.courseTitle, r.candidateCode]
        .filter(Boolean)
        .some((s) => s.toLowerCase().includes(needle));
    });
  }, [rows, q, filter]);

  const th = "px-4 py-3 font-semibold whitespace-nowrap";
  const td = "px-4 py-3 align-top";

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search candidate, email, ID, or quiz…"
          className="w-full max-w-sm rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-brand-accent"
        />
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                filter === f.key
                  ? "bg-brand text-white"
                  : "border border-line text-muted hover:bg-canvas"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted">
          {filtered.length} of {rows.length}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className={th}>Candidate</th>
              <th className={th}>Quiz</th>
              <th className={th}>Candidate ID</th>
              <th className={th}>Status</th>
              <th className={th}>Score</th>
              <th className={th}>Started</th>
              <th className={th}>Submitted</th>
              <th className={th}>Time</th>
              <th className={th}>Result sent</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted">
                  No matching attempts.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const display = r.name || r.email || "—";
                const graded = r.state === "graded";
                return (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className={td}>
                      <div className="font-semibold text-ink">{display}</div>
                      {r.name && r.email && <div className="text-xs text-muted">{r.email}</div>}
                    </td>
                    <td className={td}>
                      <div className="text-ink">{r.quizTitle}</div>
                      {r.courseTitle && <div className="text-xs text-muted">{r.courseTitle}</div>}
                    </td>
                    <td className={`${td} font-mono text-xs text-brand-dark`}>
                      {r.candidateCode || "—"}
                    </td>
                    <td className={td}>
                      <StatusBadge state={r.state} passed={r.passed} />
                    </td>
                    <td className={`${td} font-semibold text-ink`}>
                      {graded
                        ? `${Number(r.score)} / ${Number(r.maxScore)}`
                        : r.state === "submitted"
                          ? "marking…"
                          : "—"}
                    </td>
                    <td className={`${td} whitespace-nowrap text-muted`}>
                      <LocalTime iso={r.startedAt} />
                    </td>
                    <td className={`${td} whitespace-nowrap text-muted`}>
                      <LocalTime iso={r.submittedAt} />
                    </td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{r.durationLabel}</td>
                    <td className={`${td} whitespace-nowrap text-muted`}>
                      <LocalTime iso={r.resultSentAt} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
