import { createServiceClient } from "@/lib/supabase/service";

// Payload the app POSTs to the n8n "tier-result" workflow when a candidate
// upgrades. n8n maps these onto the Google Slides cert/report placeholders.
export type TierPayload = {
  tier: number;
  candidate_id: string;
  name: string;
  email: string;
  course: string;
  date: string; // e.g. "26 June 2026"
  tier1_result: "PASS" | "FAIL";
  score: number;
  max_score: number;
  performance_band: string;
  sections: { section_no: number; awarded: number; max: number }[];
  percentile: number | null; // tier 3+
  section_chart_url: string;
  percentile_chart_url: string | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// QuickChart renders a PNG from a URL-encoded config — n8n image-replaces with it.
function sectionChartUrl(sections: { section_no: number; awarded: number; max: number }[]): string {
  const config = {
    type: "bar",
    data: {
      labels: sections.map((s) => `Section ${s.section_no}`),
      datasets: [
        {
          label: "Score %",
          data: sections.map((s) => (s.max ? Math.round((s.awarded / s.max) * 100) : 0)),
          backgroundColor: "#386fa4",
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: 100 } },
    },
  };
  return `https://quickchart.io/chart?w=600&h=350&bkg=white&c=${encodeURIComponent(JSON.stringify(config))}`;
}

function percentileChartUrl(pct: number): string {
  const config = {
    type: "doughnut",
    data: {
      labels: ["You", "Others"],
      datasets: [{ data: [pct, 100 - pct], backgroundColor: ["#16a34a", "#e5e7eb"] }],
    },
    options: { plugins: { legend: { display: false } }, cutout: "70%" },
  };
  return `https://quickchart.io/chart?w=400&h=400&bkg=white&c=${encodeURIComponent(JSON.stringify(config))}`;
}

// Gather the candidate's tier data from Supabase and hand it to n8n.
// No-ops (logs) if the webhook isn't configured, so the Stripe webhook never breaks.
export async function deliverTierResult(attemptId: string, tier: number) {
  const url = process.env.N8N_TIER_WEBHOOK_URL;
  if (!url) {
    console.log("N8N_TIER_WEBHOOK_URL not set — skipping tier-result delivery.");
    return;
  }
  const svc = createServiceClient();

  const { data: attempt } = await svc
    .from("attempts")
    .select(
      "id, user_id, quiz_id, candidate_code, score, max_score, passed, performance_band, submitted_at",
    )
    .eq("id", attemptId)
    .single();
  if (!attempt) return;

  const { data: quiz } = await svc
    .from("quizzes")
    .select("title, courses(title)")
    .eq("id", attempt.quiz_id)
    .single();
  const courseEmbed = (quiz as { courses?: { title: string } | { title: string }[] } | null)
    ?.courses;
  const course = Array.isArray(courseEmbed) ? courseEmbed[0] : courseEmbed;

  const { data: authUser } = await svc.auth.admin.getUserById(attempt.user_id);
  const { data: prof } = await svc
    .from("profiles")
    .select("full_name")
    .eq("id", attempt.user_id)
    .single();

  // Per-section totals from the grades.
  const { data: gradeRows } = await svc
    .from("attempt_grades")
    .select("awarded_marks, max_marks, questions(section_no)")
    .eq("attempt_id", attemptId);
  const secMap = new Map<number, { awarded: number; max: number }>();
  for (const g of (gradeRows ?? []) as {
    awarded_marks: number;
    max_marks: number;
    questions: { section_no: number | null } | { section_no: number | null }[] | null;
  }[]) {
    const q = Array.isArray(g.questions) ? g.questions[0] : g.questions;
    const sec = q?.section_no ?? 1;
    const e = secMap.get(sec) ?? { awarded: 0, max: 0 };
    e.awarded += Number(g.awarded_marks) || 0;
    e.max += Number(g.max_marks) || 0;
    secMap.set(sec, e);
  }
  const sections = [...secMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([section_no, v]) => ({ section_no, awarded: v.awarded, max: v.max }));

  // Real cohort percentile (tier 3+): share of graded attempts on this quiz scoring lower.
  let percentile: number | null = null;
  if (tier >= 3 && attempt.score != null) {
    const base = svc
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", attempt.quiz_id)
      .eq("state", "graded");
    const { count: total } = await base;
    const { count: below } = await svc
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", attempt.quiz_id)
      .eq("state", "graded")
      .lt("score", attempt.score);
    percentile = total ? Math.round(((below ?? 0) / total) * 100) : null;
  }

  const payload: TierPayload = {
    tier,
    candidate_id: attempt.candidate_code ?? "",
    name: prof?.full_name ?? "",
    email: authUser?.user?.email ?? "",
    course: course?.title ?? "",
    date: fmtDate(attempt.submitted_at),
    tier1_result: attempt.passed ? "PASS" : "FAIL",
    score: Number(attempt.score ?? 0),
    max_score: Number(attempt.max_score ?? 0),
    performance_band: attempt.performance_band ?? "",
    sections,
    percentile,
    section_chart_url: sectionChartUrl(sections),
    percentile_chart_url: percentile != null ? percentileChartUrl(percentile) : null,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error("tier-result webhook returned", res.status);
  } catch (e) {
    console.error("tier-result webhook failed", e);
  }
}
