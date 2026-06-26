"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gradeAttempt } from "@/lib/grade";

export async function startAttempt(quizId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/courses");

  // Admins manage quizzes; they don't take them.
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role === "admin") redirect("/admin/results");

  // Resume an in-progress attempt if one exists.
  const { data: existing } = await supabase
    .from("attempts")
    .select("id")
    .eq("quiz_id", quizId)
    .eq("user_id", user.id)
    .eq("state", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) redirect(`/quiz/${existing.id}`);

  const { data: last } = await supabase
    .from("attempts")
    .select("attempt_no")
    .eq("quiz_id", quizId)
    .eq("user_id", user.id)
    .order("attempt_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: created } = await supabase
    .from("attempts")
    .insert({
      quiz_id: quizId,
      user_id: user.id,
      attempt_no: (last?.attempt_no ?? 0) + 1,
      state: "in_progress",
    })
    .select("id")
    .single();
  if (!created) redirect("/courses");
  redirect(`/quiz/${created.id}`);
}

export async function submitAttempt(attemptId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: attempt } = await supabase
    .from("attempts")
    .select("id, user_id, state, candidate_code")
    .eq("id", attemptId)
    .single();
  if (!attempt || attempt.user_id !== user.id) redirect("/dashboard");
  if (attempt.state !== "in_progress") redirect(`/results/${attemptId}`);

  // Mint the per-attempt candidate code now so it shows on the receipt
  // immediately (each attempt — hence each course taken — gets its own).
  const code =
    attempt.candidate_code ?? "EC-" + Math.random().toString(36).slice(2, 8).toUpperCase();

  await supabase
    .from("attempts")
    .update({ state: "submitted", submitted_at: new Date().toISOString(), candidate_code: code })
    .eq("id", attemptId);

  // Grade in the background: the candidate gets an instant receipt and the
  // score is delivered by email later — never shown on screen.
  after(async () => {
    try {
      await gradeAttempt(attemptId);
    } catch (e) {
      console.error("grading failed", e);
    }
  });

  redirect(`/results/${attemptId}`);
}
