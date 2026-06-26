"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gradeAttempt } from "@/lib/grade";

export async function startAttempt(quizId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/courses");

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
    .select("id, user_id, state")
    .eq("id", attemptId)
    .single();
  if (!attempt || attempt.user_id !== user.id) redirect("/dashboard");
  if (attempt.state !== "in_progress") redirect(`/results/${attemptId}`);

  // Lock the attempt, then grade with the service role.
  await supabase
    .from("attempts")
    .update({ state: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", attemptId);

  try {
    await gradeAttempt(attemptId);
  } catch (e) {
    console.error("grading failed", e);
  }

  redirect(`/results/${attemptId}`);
}
