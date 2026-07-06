"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Result = {
  valid: boolean;
  serial?: string;
  name?: string;
  course?: string;
  quiz?: string;
  candidate_id?: string;
  started_at?: string;
  submitted_at?: string;
  issued_at?: string;
  revoked?: boolean;
  error?: string;
};

function fmtDateTime(iso?: string) {
  if (!iso) return undefined;
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function duration(a?: string, b?: string) {
  if (!a || !b) return undefined;
  const s = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex justify-between border-b border-line py-1.5">
      <dt className="text-muted">{k}</dt>
      <dd className="font-semibold text-ink">{v ?? "—"}</dd>
    </div>
  );
}

export function VerifyForm({ initialCode = "" }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  async function runCheck(value: string) {
    const v = value.trim();
    if (!v) return;
    setLoading(true);
    setResult(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("verify_certificate", { p_verify_id: v });
    setLoading(false);
    if (error) {
      setResult({ valid: false, error: error.message });
      return;
    }
    setResult(data as Result);
  }

  // Auto-verify when arriving from a certificate link/QR (/verify?id=...).
  useEffect(() => {
    if (initialCode.trim()) runCheck(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  return (
    <div className="mx-auto max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runCheck(code);
        }}
        className="flex gap-2"
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter verification code"
          className="flex-1 rounded-xl border border-line px-4 py-3 outline-none focus:border-brand-accent"
        />
        <button
          disabled={loading || !code.trim()}
          className="rounded-xl bg-brand px-6 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {loading ? "Checking…" : "Verify"}
        </button>
      </form>

      {result && (
        <div
          className={`mt-6 rounded-2xl border p-6 ${
            result.valid ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
          }`}
        >
          {result.valid ? (
            <>
              <p className="text-lg font-bold text-green-700">✓ Valid certificate</p>
              <dl className="mt-4 grid gap-1 text-sm">
                <Row k="Name" v={result.name} />
                <Row k="Course" v={result.course} />
                <Row k="Quiz" v={result.quiz} />
                <Row k="Candidate ID" v={result.candidate_id} />
                <Row k="Started" v={fmtDateTime(result.started_at)} />
                <Row k="Submitted" v={fmtDateTime(result.submitted_at)} />
                <Row k="Time taken" v={duration(result.started_at, result.submitted_at)} />
                <Row k="Serial" v={result.serial} />
                <Row
                  k="Issued"
                  v={result.issued_at ? new Date(result.issued_at).toLocaleDateString() : undefined}
                />
              </dl>
            </>
          ) : (
            <p className="text-lg font-bold text-red-700">
              ✗{" "}
              {result.revoked
                ? "This certificate has been revoked."
                : !result.error || result.error === "not_found"
                  ? "No matching certificate found."
                  : result.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
