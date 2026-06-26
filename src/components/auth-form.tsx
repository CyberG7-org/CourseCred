"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "register";
type Msg = { type: "error" | "success"; text: string };

function AuthForm({ initialMode = "login" }: { initialMode?: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") ?? "/dashboard";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<Msg | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (mode === "register" && password !== confirm) {
      setMsg({ type: "error", text: "Passwords do not match." });
      return;
    }
    setLoading(true);
    const supabase = createClient();
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push(redirect);
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg({
          type: "success",
          text: "Account created. Check your email if confirmation is enabled, then sign in.",
        });
        setMode("login");
      }
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          redirect,
        )}`,
      },
    });
    if (error) setMsg({ type: "error", text: error.message });
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-xl">
      <h2 className="text-2xl font-bold text-brand-dark">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {mode === "login"
          ? "Sign in to continue to your dashboard."
          : "Register to start your quiz journey."}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-canvas p-1">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`rounded-lg py-2 text-sm font-bold ${
            mode === "login" ? "bg-white text-brand-dark shadow" : "text-brand"
          }`}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`rounded-lg py-2 text-sm font-bold ${
            mode === "register" ? "bg-white text-brand-dark shadow" : "text-brand"
          }`}
        >
          Register
        </button>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-semibold">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-brand-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-brand-accent"
          />
        </div>
        {mode === "register" && (
          <div>
            <label className="mb-1 block text-sm font-semibold">
              Confirm password
            </label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm your password"
              className="w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-brand-accent"
            />
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {loading
            ? "Please wait…"
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        onClick={onGoogle}
        className="w-full rounded-xl border border-line bg-white py-3 font-bold text-ink hover:bg-canvas"
      >
        Continue with Google
      </button>

      {msg && (
        <div
          className={`mt-4 rounded-lg px-4 py-3 text-sm ${
            msg.type === "error"
              ? "bg-red-50 text-red-700"
              : "bg-green-50 text-green-700"
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}

export function AuthScreen({ mode }: { mode: Mode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-center bg-gradient-to-br from-brand-dark to-brand p-14 text-white lg:flex">
        <Link href="/" className="text-2xl font-extrabold">
          ExamCert
        </Link>
        <h1 className="mt-10 max-w-md text-4xl font-extrabold leading-tight">
          Your quizzes, results, and certificates in one place.
        </h1>
        <p className="mt-4 max-w-md text-brand-light">
          Sign in to take assessments, track your progress, and download
          verifiable certificates.
        </p>
      </div>
      <div className="flex items-center justify-center p-6">
        <Suspense>
          <AuthForm initialMode={mode} />
        </Suspense>
      </div>
    </div>
  );
}
