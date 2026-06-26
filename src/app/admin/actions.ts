"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateQuiz, type GenQuiz } from "@/lib/anthropic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/dashboard");
  return supabase;
}

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "course"
  );
}

export type GenState = { error?: string };

export async function generateQuizAction(
  _prev: GenState,
  formData: FormData,
): Promise<GenState> {
  const supabase = await requireAdmin();

  const courseId = String(formData.get("course_id") || "");
  const newCourseTitle = String(formData.get("new_course_title") || "").trim();
  const quizTitle = String(formData.get("quiz_title") || "").trim() || "Untitled quiz";
  const topic = String(formData.get("topic") || "").trim();
  const knowledgeBase = String(formData.get("knowledge_base") || "");
  const difficulty = String(formData.get("difficulty") || "medium") as
    | "easy"
    | "medium"
    | "hard";
  const sections = Math.max(1, Math.min(4, Number(formData.get("sections") || 1)));
  const mcq = Math.max(0, Math.min(10, Number(formData.get("mcq") || 5)));
  const short = Math.max(0, Math.min(10, Number(formData.get("short") || 2)));
  const long = Math.max(0, Math.min(5, Number(formData.get("long") || 1)));

  if (!topic) return { error: "Topic is required." };
  if (mcq + short + long === 0) return { error: "Include at least one question." };

  let quizId: string;
  try {
    // Resolve the course (create a draft if a new title was given).
    let resolvedCourseId = courseId;
    if (!resolvedCourseId && newCourseTitle) {
      const slug = `${slugify(newCourseTitle)}-${Math.random().toString(36).slice(2, 6)}`;
      const { data: course, error } = await supabase
        .from("courses")
        .insert({ title: newCourseTitle, slug, status: "draft" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      resolvedCourseId = course!.id;
    }
    if (!resolvedCourseId) {
      return { error: "Pick an existing course or enter a new course title." };
    }

    // Generate with the LLM.
    const quiz: GenQuiz = await generateQuiz({
      topic,
      knowledgeBase,
      difficulty,
      sections,
      mcqPerSection: mcq,
      shortPerSection: short,
      longPerSection: long,
    });

    let total = 0;
    quiz.sections.forEach((s) =>
      s.questions.forEach((q) => {
        total += Number(q.marks) || 0;
      }),
    );
    if (total === 0) return { error: "The model produced an empty quiz. Try again." };

    const { data: quizRow, error: qErr } = await supabase
      .from("quizzes")
      .insert({
        course_id: resolvedCourseId,
        title: quizTitle,
        total_marks: total,
        pass_mark: Math.ceil(total / 2),
        status: "draft",
      })
      .select("id")
      .single();
    if (qErr) throw new Error(qErr.message);
    quizId = quizRow!.id;

    // Insert questions + answer keys + quiz slots.
    let slot = 1;
    for (let si = 0; si < quiz.sections.length; si++) {
      const section = quiz.sections[si];
      for (const q of section.questions) {
        const { data: qrow, error: insErr } = await supabase
          .from("questions")
          .insert({
            course_id: resolvedCourseId,
            section_no: si + 1,
            section_title: section.title,
            type: q.type,
            marks: q.marks,
            stem: q.stem,
            options: q.options ?? [],
            status: "review",
          })
          .select("id")
          .single();
        if (insErr) throw new Error(insErr.message);

        const { error: keyErr } = await supabase.from("question_keys").insert({
          question_id: qrow!.id,
          correct_answer: q.correct_answer ?? "",
          model_answer: q.model_answer ?? "",
          rubric: q.rubric ?? [],
          anchors: [],
        });
        if (keyErr) throw new Error(keyErr.message);

        const { error: slotErr } = await supabase.from("quiz_slots").insert({
          quiz_id: quizId,
          question_id: qrow!.id,
          slot_no: slot,
          section_no: si + 1,
        });
        if (slotErr) throw new Error(slotErr.message);
        slot++;
      }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Generation failed." };
  }

  revalidatePath("/admin");
  redirect(`/admin/quizzes/${quizId}`);
}

export async function createCourse(formData: FormData) {
  const supabase = await requireAdmin();
  const title = String(formData.get("title") || "").trim();
  if (!title) return;
  const slug = `${slugify(title)}-${Math.random().toString(36).slice(2, 6)}`;
  await supabase.from("courses").insert({ title, slug, status: "draft" });
  revalidatePath("/admin/courses");
}

export async function setCourseStatus(courseId: string, status: "draft" | "published") {
  const supabase = await requireAdmin();
  await supabase.from("courses").update({ status }).eq("id", courseId);
  revalidatePath("/admin/courses");
  revalidatePath("/courses");
  revalidatePath("/");
}

export async function publishQuiz(quizId: string) {
  const supabase = await requireAdmin();
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("course_id")
    .eq("id", quizId)
    .single();
  const { data: slots } = await supabase
    .from("quiz_slots")
    .select("question_id")
    .eq("quiz_id", quizId);
  const qids = (slots ?? []).map((s) => s.question_id);
  if (qids.length) {
    await supabase.from("questions").update({ status: "published" }).in("id", qids);
  }
  await supabase.from("quizzes").update({ status: "published" }).eq("id", quizId);
  if (quiz?.course_id) {
    await supabase.from("courses").update({ status: "published" }).eq("id", quiz.course_id);
  }
  revalidatePath(`/admin/quizzes/${quizId}`);
  revalidatePath("/courses");
  revalidatePath("/");
}
