"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Result = {
  valid: boolean;
  serial?: string;
  name?: string;
  course?: string;
  issued_at?: string;
  revoked?: boolean;
  error?: string;
};

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex justify-between border-b border-line py-1.5">
      <dt className="text-muted">{k}</dt>
      <dd className="font-semibold text-ink">{v ?? "—"}</dd>
    </div>
  );
}

export function VerifyForm() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("verify_certificate", {
      p_verify_id: code.trim(),
    });
    setLoading(false);
    if (error) {
      setResult({ valid: false, error: error.message });
      return;
    }
    setResult(data as Result);
  }

  return (
    <div className="mx-auto max-w-xl">
      <form onSubmit={check} className="flex gap-2">
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
            result.valid
              ? "border-green-200 bg-green-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          {result.valid ? (
            <>
              <p className="text-lg font-bold text-green-700">
                ✓ Valid certificate
              </p>
              <dl className="mt-4 grid gap-1 text-sm">
                <Row k="Name" v={result.name} />
                <Row k="Course" v={result.course} />
                <Row k="Serial" v={result.serial} />
                <Row
                  k="Issued"
                  v={
                    result.issued_at
                      ? new Date(result.issued_at).toLocaleDateString()
                      : undefined
                  }
                />
              </dl>
            </>
          ) : (
            <p className="text-lg font-bold text-red-700">
              ✗{" "}
              {!result.error || result.error === "not_found"
                ? "No matching certificate found."
                : result.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
