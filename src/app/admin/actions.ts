"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import mammoth from "mammoth";
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
  const pastedKb = String(formData.get("knowledge_base") || "");
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

    // Optional uploaded document → PDFs go to the model directly; DOCX/TXT are extracted.
    let pdfBase64: string | undefined;
    let extracted = "";
    const file = formData.get("kb_file");
    if (file && typeof file !== "string" && (file as File).size > 0) {
      const f = file as File;
      const buf = Buffer.from(await f.arrayBuffer());
      const name = (f.name || "").toLowerCase();
      if (f.type === "application/pdf" || name.endsWith(".pdf")) {
        pdfBase64 = buf.toString("base64");
      } else if (name.endsWith(".docx") || f.type.includes("word")) {
        const r = await mammoth.extractRawText({ buffer: buf });
        extracted = r.value || "";
      } else {
        extracted = buf.toString("utf-8");
      }
    }
    const knowledgeBase = [pastedKb, extracted]
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n\n");

    // Generate with the LLM.
    const quiz: GenQuiz = await generateQuiz({
      topic,
      knowledgeBase,
      pdfBase64,
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

export async function unpublishQuiz(quizId: string) {
  const supabase = await requireAdmin();
  await supabase.from("quizzes").update({ status: "draft" }).eq("id", quizId);
  revalidatePath(`/admin/quizzes/${quizId}`);
  revalidatePath("/courses");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Question CRUD
// ---------------------------------------------------------------------------

function parseRubric(text: string): { points: number; criterion: string }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const idx = l.indexOf("|");
      if (idx === -1) return { points: 0, criterion: l };
      return { points: Number(l.slice(0, idx).trim()) || 0, criterion: l.slice(idx + 1).trim() };
    });
}

function buildFromForm(formData: FormData, suffix = "") {
  const g = (k: string) => formData.get(`${k}${suffix}`);
  const type = String(g("type") || "short");
  const marks = Math.max(1, Math.min(100, Number(g("marks") || 1)));
  const stem = String(g("stem") || "").trim();
  const sectionNo = Math.max(1, Number(g("section_no") || 1));
  const sectionTitle = String(g("section_title") || "").trim() || null;

  let options: { key: string; label: string }[] = [];
  let correct = "";
  let modelAnswer = "";
  let rubric: { points: number; criterion: string }[] = [];

  if (type === "mcq") {
    options = ["A", "B", "C", "D"]
      .map((k) => ({ key: k, label: String(formData.get(`opt_${k}${suffix}`) || "").trim() }))
      .filter((o) => o.label);
    correct = String(g("correct") || "A");
  } else if (type === "true_false") {
    options = [
      { key: "true", label: "True" },
      { key: "false", label: "False" },
    ];
    correct = String(g("correct") || "true");
  } else {
    modelAnswer = String(g("model_answer") || "");
    rubric = parseRubric(String(g("rubric") || ""));
  }
  return { type, marks, stem, sectionNo, sectionTitle, options, correct, modelAnswer, rubric };
}

async function recomputeQuizTotal(quizId: string) {
  const supabase = await createClient();
  const { data: slots } = await supabase
    .from("quiz_slots")
    .select("questions(marks)")
    .eq("quiz_id", quizId);
  let total = 0;
  for (const s of (slots ?? []) as {
    questions: { marks: number } | { marks: number }[] | null;
  }[]) {
    const q = Array.isArray(s.questions) ? s.questions[0] : s.questions;
    total += q?.marks ?? 0;
  }
  await supabase
    .from("quizzes")
    .update({ total_marks: total, pass_mark: Math.max(1, Math.ceil(total / 2)) })
    .eq("id", quizId);
}

export async function updateQuestion(questionId: string, quizId: string, formData: FormData) {
  const supabase = await requireAdmin();
  const v = buildFromForm(formData);
  if (!v.stem) return;
  await supabase
    .from("questions")
    .update({
      type: v.type,
      marks: v.marks,
      stem: v.stem,
      section_no: v.sectionNo,
      section_title: v.sectionTitle,
      options: v.options,
    })
    .eq("id", questionId);
  await supabase
    .from("question_keys")
    .update({ correct_answer: v.correct, model_answer: v.modelAnswer, rubric: v.rubric })
    .eq("question_id", questionId);
  await recomputeQuizTotal(quizId);
  revalidatePath(`/admin/quizzes/${quizId}`);
}

export async function addQuestion(quizId: string, courseId: string, formData: FormData) {
  const supabase = await requireAdmin();
  const v = buildFromForm(formData);
  if (!v.stem) return;

  const { data: q } = await supabase
    .from("questions")
    .insert({
      course_id: courseId,
      section_no: v.sectionNo,
      section_title: v.sectionTitle,
      type: v.type,
      marks: v.marks,
      stem: v.stem,
      options: v.options,
      status: "review",
    })
    .select("id")
    .single();
  if (!q) return;

  await supabase.from("question_keys").insert({
    question_id: q.id,
    correct_answer: v.correct,
    model_answer: v.modelAnswer,
    rubric: v.rubric,
    anchors: [],
  });

  const { data: maxSlot } = await supabase
    .from("quiz_slots")
    .select("slot_no")
    .eq("quiz_id", quizId)
    .order("slot_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("quiz_slots").insert({
    quiz_id: quizId,
    question_id: q.id,
    slot_no: (maxSlot?.slot_no ?? 0) + 1,
    section_no: v.sectionNo,
  });

  await recomputeQuizTotal(quizId);
  revalidatePath(`/admin/quizzes/${quizId}`);
}

export async function deleteQuestion(questionId: string, quizId: string) {
  const supabase = await requireAdmin();
  await supabase.from("quiz_slots").delete().eq("quiz_id", quizId).eq("question_id", questionId);
  await supabase.from("questions").delete().eq("id", questionId);
  await recomputeQuizTotal(quizId);
  revalidatePath(`/admin/quizzes/${quizId}`);
}

// Save every question on the quiz in one shot. Each question's fields are
// suffixed with `__<questionId>`; `qids` carries the ordered id list.
export async function saveAllQuestions(quizId: string, formData: FormData) {
  const supabase = await requireAdmin();
  const qids = String(formData.get("qids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const qid of qids) {
    const v = buildFromForm(formData, `__${qid}`);
    if (!v.stem) continue;
    await supabase
      .from("questions")
      .update({
        type: v.type,
        marks: v.marks,
        stem: v.stem,
        section_no: v.sectionNo,
        section_title: v.sectionTitle,
        options: v.options,
      })
      .eq("id", qid);
    await supabase
      .from("question_keys")
      .update({ correct_answer: v.correct, model_answer: v.modelAnswer, rubric: v.rubric })
      .eq("question_id", qid);
  }

  await recomputeQuizTotal(quizId);
  revalidatePath(`/admin/quizzes/${quizId}`);
}

// Generate questions with the LLM and append them to an existing quiz.
export async function aiAddQuestions(
  quizId: string,
  courseId: string,
  _prev: GenState,
  formData: FormData,
): Promise<GenState> {
  const supabase = await requireAdmin();
  const topic = String(formData.get("topic") || "").trim();
  const difficulty = String(formData.get("difficulty") || "medium") as
    | "easy"
    | "medium"
    | "hard";
  const mcq = Math.max(0, Math.min(10, Number(formData.get("mcq") || 0)));
  const short = Math.max(0, Math.min(10, Number(formData.get("short") || 0)));
  const long = Math.max(0, Math.min(5, Number(formData.get("long") || 0)));
  const knowledgeBase = String(formData.get("knowledge_base") || "");

  if (!topic) return { error: "Topic is required." };
  if (mcq + short + long === 0) return { error: "Choose at least one question to add." };

  try {
    const gen = await generateQuiz({
      topic,
      knowledgeBase,
      difficulty,
      sections: 1,
      mcqPerSection: mcq,
      shortPerSection: short,
      longPerSection: long,
    });
    const newQs = gen.sections.flatMap((s) => s.questions);
    if (!newQs.length) return { error: "The model returned no questions. Try again." };

    const { data: maxSlot } = await supabase
      .from("quiz_slots")
      .select("slot_no, section_no")
      .eq("quiz_id", quizId)
      .order("slot_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    let slot = maxSlot?.slot_no ?? 0;
    const sectionNo = maxSlot?.section_no ?? 1;

    for (const q of newQs) {
      slot++;
      const { data: qrow } = await supabase
        .from("questions")
        .insert({
          course_id: courseId,
          section_no: sectionNo,
          section_title: null,
          type: q.type,
          marks: q.marks,
          stem: q.stem,
          options: q.options ?? [],
          status: "review",
        })
        .select("id")
        .single();
      if (!qrow) continue;
      await supabase.from("question_keys").insert({
        question_id: qrow.id,
        correct_answer: q.correct_answer ?? "",
        model_answer: q.model_answer ?? "",
        rubric: q.rubric ?? [],
        anchors: [],
      });
      await supabase.from("quiz_slots").insert({
        quiz_id: quizId,
        question_id: qrow.id,
        slot_no: slot,
        section_no: sectionNo,
      });
    }

    await recomputeQuizTotal(quizId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Generation failed." };
  }

  revalidatePath(`/admin/quizzes/${quizId}`);
  return {};
}
