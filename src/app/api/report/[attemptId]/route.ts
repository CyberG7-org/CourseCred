import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildReportPdf, buildTier3ReportPdf } from "@/lib/pdf-templates";
import {
  generateDetailedSectionAnalysis,
  generateSectionAnalysis,
  type DetailedSectionOut,
  type SectionAnalysisOut,
} from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60; // allow the one-time AI analysis generation

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fallbackDetailedSection(
  section_no: number,
  awarded: number,
  max: number,
): DetailedSectionOut {
  const pct = max ? (awarded / max) * 100 : 0;
  const band =
    pct >= 80 ? "excellent" : pct >= 60 ? "good" : pct >= 40 ? "developing" : "limited";
  return {
    section_no,
    performance_analysis: `The candidate achieved ${awarded}/${max} in this section, showing ${band} performance based on the available marks. Review the underlying questions and model answers for the most specific improvement areas.`,
    strengths:
      pct >= 60
        ? ["The candidate handled a meaningful share of this section successfully."]
        : ["No clear strengths were identifiable from the marks in this section."],
    weaknesses:
      pct >= 80
        ? ["No significant weaknesses were identified."]
        : ["Some answers in this section require further review and reinforcement."],
  };
}

async function fetchPng(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch PNG: ${res.status} ${url}`);
  return res.arrayBuffer();
}

function chartUrl(sections: { section_no: number; awarded: number; max: number }[]) {
  const nonEmptySections = sections.filter((s) => s.max > 0);
  const config = {
    type: "doughnut",
    data: {
      labels: nonEmptySections.map((s) => `Section ${s.section_no}`),
      datasets: [
        {
          data: nonEmptySections.map((s) => s.awarded),
          backgroundColor: ["#4E79A7", "#F28E2B", "#E15759", "#76B7B2"],
          borderColor: "#FFFFFF",
          borderWidth: 3,
        },
      ],
    },
    options: {
      backgroundColor: "transparent",
      legend: {
        position: "top",
        labels: { fontColor: "#888888", fontSize: 24, boxWidth: 84, padding: 18 },
      },
      plugins: {
        datalabels: {
          color: "#666666",
          font: { size: 22 },
          formatter: "function(value) { return String(value); }",
        },
      },
    },
  };
  return `https://quickchart.io/chart?width=1000&height=600&format=png&backgroundColor=transparent&c=${encodeURIComponent(
    JSON.stringify(config),
  )}`;
}

// Tier 2+ performance report PDF, rendered from the branded Slides artwork, with
// AI-written per-section analysis (generated once, cached on the attempt).
export async function GET(req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Sign in to download your report.", { status: 401 });

  const { data: a } = await supabase
    .from("attempts")
    .select("id, user_id, quiz_id, passed, candidate_code, submitted_at, state")
    .eq("id", attemptId)
    .single();
  if (!a || a.user_id !== user.id) return new Response("Report not found.", { status: 404 });
  if (a.state !== "graded") return new Response("Report not ready yet.", { status: 409 });

  const svc = createServiceClient();
  const { data: ents } = await svc.from("entitlements").select("tier").eq("attempt_id", attemptId);
  const tier = (ents ?? []).reduce((m, e) => Math.max(m, Number(e.tier) || 1), 1);
  if (tier < 2) {
    return new Response("A performance report requires Tier 2 or above.", { status: 403 });
  }

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("courses(title)")
    .eq("id", a.quiz_id)
    .single();
  const courseEmbed = (quiz as { courses?: { title: string } | { title: string }[] } | null)
    ?.courses;
  const course = Array.isArray(courseEmbed) ? courseEmbed[0] : courseEmbed;
  const { data: prof } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
  const name = prof?.full_name?.trim() || user.email?.split("@")[0] || "Candidate";

  // Per-question grade data (section totals + the answers the AI reasons over).
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
  const totals = new Map(
    secNos.map((n) => {
      const qs = bySec.get(n)!;
      return [
        n,
        { awarded: qs.reduce((s, q) => s + q.awarded, 0), max: qs.reduce((s, q) => s + q.max, 0) },
      ];
    }),
  );

  // AI section analysis — cached on the attempt, generated on first download.
  const analysisMap = new Map<number, string>();
  const { data: saRow } = await svc
    .from("attempts")
    .select("section_analysis")
    .eq("id", attemptId)
    .maybeSingle();
  const cached = (saRow?.section_analysis as SectionAnalysisOut[] | null) ?? null;
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
      await svc.from("attempts").update({ section_analysis: out }).eq("id", attemptId); // best-effort cache
    } catch (e) {
      console.error("section analysis generation failed — falling back to rule-based", e);
    }
  }

  const sections = secNos.map((n) => ({
    section_no: n,
    awarded: totals.get(n)!.awarded,
    max: totals.get(n)!.max,
    analysis: analysisMap.get(n),
  }));

  const origin = new URL(req.url).origin;

  if (tier >= 3) {
    const detailedMap = new Map<number, DetailedSectionOut>();
    const { data: daRow } = await svc
      .from("attempts")
      .select("detailed_analysis")
      .eq("id", attemptId)
      .maybeSingle();
    const cachedDetailed = (daRow?.detailed_analysis as DetailedSectionOut[] | null) ?? null;
    if (Array.isArray(cachedDetailed) && cachedDetailed.length) {
      for (const c of cachedDetailed) detailedMap.set(c.section_no, c);
    } else {
      try {
        const out = await generateDetailedSectionAnalysis(
          secNos.map((n) => ({
            section_no: n,
            awarded: totals.get(n)!.awarded,
            max: totals.get(n)!.max,
            questions: bySec.get(n)!,
          })),
        );
        for (const o of out) detailedMap.set(o.section_no, o);
        await svc.from("attempts").update({ detailed_analysis: out }).eq("id", attemptId);
      } catch (e) {
        console.error("detailed section analysis generation failed - using fallback", e);
      }
    }

    const tier3Sections = [1, 2, 3, 4].map((n) => {
      const total = totals.get(n);
      if (!total) {
        return {
          section_no: n,
          awarded: 0,
          max: 0,
          performance_analysis: "N/A - no questions were included in this section.",
          strengths: ["N/A"],
          weaknesses: ["N/A"],
        };
      }
      return {
        ...(detailedMap.get(n) ?? fallbackDetailedSection(n, total.awarded, total.max)),
        awarded: total.awarded,
        max: total.max,
      };
    });
    const scoreAwarded = [...totals.values()].reduce((sum, s) => sum + s.awarded, 0);
    const scoreMax = [...totals.values()].reduce((sum, s) => sum + s.max, 0);
    const scorePct = scoreMax ? Math.round((scoreAwarded / scoreMax) * 100) : 0;
    const [bg1, bg2, bg3, chartBytes] = await Promise.all([
      fetchPng(`${origin}/tier3-bg-1.png`),
      fetchPng(`${origin}/tier3-bg-2.png`),
      fetchPng(`${origin}/tier3-bg-3.png`),
      fetchPng(chartUrl(tier3Sections)),
    ]);
    const bytes = await buildTier3ReportPdf({
      name,
      candidateId: a.candidate_code ?? "-",
      course: course?.title ?? "Assessment",
      date: fmtDate(a.submitted_at),
      score: `${scorePct}%`,
      sections: tier3Sections,
      bgBytes: [bg1, bg2, bg3],
      chartBytes,
    });

    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="CourseCred-Tier3-Report-${a.candidate_code ?? "report"}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }
  const bgBytes = await fetchPng(`${origin}/tier2-bg.png`);
  const bytes = await buildReportPdf({
    name,
    candidateId: a.candidate_code ?? "—",
    course: course?.title ?? "Assessment",
    date: fmtDate(a.submitted_at),
    sections,
    grade: a.passed ? "PASS" : "FAIL",
    bgBytes,
  });

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="CourseCred-Report-${a.candidate_code ?? "report"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
