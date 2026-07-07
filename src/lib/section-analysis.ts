import { createServiceClient } from "@/lib/supabase/service";
import { generateSectionAnalysis, type SectionAnalysisOut } from "@/lib/anthropic";

// One engine for the per-section performance analysis, shared by the web result
// page, the report PDF, and the grading pipeline (which pre-generates it).
// The AI text is cached in attempts.section_analysis (migration 0006); without
// the column everything still works — it just regenerates per request.

export type SectionResult = {
  section_no: number;
  awarded: number;
  max: number;
  analysis: string;
};

// Rule-based fallback when the AI analysis is unavailable.
export function fallbackAnalysis(awarded: number, max: number): string {
  const pct = max ? (awarded / max) * 100 : 0;
  if (pct >= 80)
    return "Excellent — outstanding, comprehensive performance with accurate answers across this section.";
  if (pct >= 60) return "Good — a solid understanding overall, with a few areas to strengthen.";
  if (pct >= 40) return "Fair — a mixed result; several questions in this section need review.";
  return "Poor — a low score, with multiple questions missed or left unanswered. Revisit this section's material.";
}

export async function getSectionsWithAnalysis(attemptId: string): Promise<SectionResult[]> {
  const svc = createServiceClient();

  // Per-question grades + the answers the AI reasons over, grouped by section.
  const { data: g } = await svc
    .from("attempt_grades")
    .select("question_id, awarded_marks, max_marks, questions(section_no, type, stem)")
    .eq("attempt_id", attemptId);
  const { data: ansRows } = await svc
    .from("attempt_answers")
    .select("question_id, answer")
    .eq("attempt_id", attemptId);
  const ansMap = new Map(
    (ansRows ?? []).map((r: { question_id: string; answer: unknown }) => [
      r.question_id,
      typeof r.answer === "string" ? r.answer : String(r.answer ?? ""),
    ]),
  );

  type QRow = { type: string; stem: string; awarded: number; max: number; answer: string };
  const bySec = new Map<number, QRow[]>();
  for (const row of (g ?? []) as {
    question_id: string;
    awarded_marks: number;
    max_marks: number;
    questions:
      | { section_no: number | null; type: string; stem: string }
      | { section_no: number | null; type: string; stem: string }[]
      | null;
  }[]) {
    const q = Array.isArray(row.questions) ? row.questions[0] : row.questions;
    const sec = q?.section_no ?? 1;
    const arr = bySec.get(sec) ?? [];
    arr.push({
      type: q?.type ?? "",
      stem: q?.stem ?? "",
      awarded: Number(row.awarded_marks) || 0,
      max: Number(row.max_marks) || 0,
      answer: (ansMap.get(row.question_id) ?? "").replace(/^"|"$/g, ""),
    });
    bySec.set(sec, arr);
  }
  const secNos = [...bySec.keys()].sort((x, y) => x - y);
  if (!secNos.length) return [];
  const totals = new Map(
    secNos.map((n) => {
      const qs = bySec.get(n)!;
      return [
        n,
        { awarded: qs.reduce((s, q) => s + q.awarded, 0), max: qs.reduce((s, q) => s + q.max, 0) },
      ] as const;
    }),
  );

  // Cached AI analysis, or generate + cache it now.
  const analysisMap = new Map<number, string>();
  const { data: aRow } = await svc
    .from("attempts")
    .select("section_analysis")
    .eq("id", attemptId)
    .maybeSingle();
  const cached = (aRow?.section_analysis as SectionAnalysisOut[] | null) ?? null;
  if (Array.isArray(cached) && cached.length) {
    for (const c of cached) analysisMap.set(c.section_no, c.analysis);
  } else {
    try {
      const out = await generateSectionAnalysis(
        secNos.map((n) => ({
          section_no: n,
          awarded: totals.get(n)!.awarded,
          max: totals.get(n)!.max,
          questions: bySec.get(n)!,
        })),
      );
      for (const o of out) analysisMap.set(o.section_no, o.analysis);
      // Best-effort cache — ignored if the 0006 column doesn't exist yet.
      await svc.from("attempts").update({ section_analysis: out }).eq("id", attemptId);
    } catch (e) {
      console.error("section analysis generation failed — using rule-based fallback", e);
    }
  }

  return secNos.map((n) => ({
    section_no: n,
    awarded: totals.get(n)!.awarded,
    max: totals.get(n)!.max,
    analysis:
      analysisMap.get(n) ?? fallbackAnalysis(totals.get(n)!.awarded, totals.get(n)!.max),
  }));
}
