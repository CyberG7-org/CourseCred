import { createServiceClient } from "@/lib/supabase/service";
import { ResultsTable, type ResultRow } from "./results-table";

export const metadata = { title: "Results — Admin" };
export const dynamic = "force-dynamic";

type CourseEmbed = { title: string | null };
type QuizEmbed = { title: string | null; courses: CourseEmbed | CourseEmbed[] | null };
type Attempt = {
  id: string;
  user_id: string;
  state: string;
  score: number | null;
  max_score: number | null;
  passed: boolean | null;
  candidate_code: string | null;
  started_at: string;
  submitted_at: string | null;
  quizzes: QuizEmbed | QuizEmbed[] | null;
};

function duration(start: string, end: string | null) {
  if (!end) return "—";
  const s = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
}

export default async function AdminResults() {
  const svc = createServiceClient();

  const { data: attemptsData } = await svc
    .from("attempts")
    .select(
      "id, user_id, state, score, max_score, passed, candidate_code, started_at, submitted_at, quizzes(title, courses(title))",
    )
    .order("started_at", { ascending: false })
    .limit(500);
  const attempts = (attemptsData ?? []) as unknown as Attempt[];

  const ids = [...new Set(attempts.map((a) => a.user_id))];
  const { data: profs } = await svc
    .from("profiles")
    .select("id, full_name")
    .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name ?? ""]));

  const { data: usersList } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map((usersList?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  const rows: ResultRow[] = attempts.map((a) => {
    const quiz = Array.isArray(a.quizzes) ? a.quizzes[0] : a.quizzes;
    const course = quiz && (Array.isArray(quiz.courses) ? quiz.courses[0] : quiz.courses);
    return {
      id: a.id,
      name: nameById.get(a.user_id) || "",
      email: emailById.get(a.user_id) || "",
      quizTitle: quiz?.title ?? "—",
      courseTitle: course?.title ?? "",
      candidateCode: a.candidate_code ?? "",
      state: a.state,
      passed: a.passed,
      score: a.score,
      maxScore: a.max_score,
      startedAt: a.started_at,
      submittedAt: a.submitted_at,
      durationLabel: duration(a.started_at, a.submitted_at),
    };
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Results</h1>
      <p className="mt-1 text-sm text-muted">
        Every candidate attempt — read live from the <code>attempts</code> table. Scores arrive once
        background marking finishes.
      </p>
      <ResultsTable rows={rows} />
    </div>
  );
}
