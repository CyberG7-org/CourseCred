import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export const metadata = { title: "Review answers — CourseCred" };

type QEmbed = {
  id: string;
  type: string;
  stem: string;
  options: { key: string; label: string }[] | null;
};
type SlotEmbed = { slot_no: number; questions: QEmbed | QEmbed[] | null };

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/results/${attemptId}/review`);

  const { data: a } = await supabase
    .from("attempts")
    .select("id, user_id, candidate_code, quiz_id")
    .eq("id", attemptId)
    .single();
  if (!a || a.user_id !== user.id) notFound();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("title, courses(title)")
    .eq("id", a.quiz_id)
    .single();
  const courseEmbed = (quiz as { courses?: { title: string } | { title: string }[] } | null)
    ?.courses;
  const course = Array.isArray(courseEmbed) ? courseEmbed[0] : courseEmbed;

  const { data: slotData } = await supabase
    .from("quiz_slots")
    .select("slot_no, questions(id, type, stem, options)")
    .eq("quiz_id", a.quiz_id)
    .order("slot_no");
  const slots = (slotData ?? []) as unknown as SlotEmbed[];
  const questions = slots
    .map((s) => (Array.isArray(s.questions) ? s.questions[0] : s.questions))
    .filter((q): q is QEmbed => !!q);

  const { data: ansData } = await supabase
    .from("attempt_answers")
    .select("question_id, answer")
    .eq("attempt_id", attemptId);
  const ansMap = new Map(
    (ansData ?? []).map((x: { question_id: string; answer: unknown }) => [
      x.question_id,
      typeof x.answer === "string" ? x.answer : String(x.answer ?? ""),
    ]),
  );

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-5 py-10">
          <Link href={`/results/${attemptId}`} className="text-sm text-brand hover:underline">
            ← Back to result
          </Link>
          <p className="mt-2 text-sm text-muted">{course?.title}</p>
          <h1 className="text-2xl font-bold text-brand-dark">{quiz?.title}</h1>
          <p className="mt-1 text-sm text-muted">
            Your submitted answers · Candidate ID{" "}
            <span className="font-mono">{a.candidate_code ?? "—"}</span>
          </p>

          <ol className="mt-6 space-y-4">
            {questions.map((q, i) => {
              const ans = (ansMap.get(q.id) ?? "").replace(/^"|"$/g, "");
              const isChoice = q.type === "mcq" || q.type === "true_false";
              const options =
                q.type === "true_false"
                  ? [
                      { key: "true", label: "True" },
                      { key: "false", label: "False" },
                    ]
                  : (q.options ?? []);
              return (
                <li key={q.id} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                  <p className="font-semibold text-ink">
                    {i + 1}. {q.stem}
                  </p>

                  {isChoice ? (
                    <div className="mt-3 space-y-2">
                      {options.map((o) => {
                        const chosen = ans === o.key;
                        return (
                          <div
                            key={o.key}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                              chosen
                                ? "border-brand bg-brand-light/20 font-semibold text-brand-dark"
                                : "border-line text-ink"
                            }`}
                          >
                            {q.type === "mcq" && <span className="font-bold">{o.key}.</span>}
                            <span className="capitalize">{o.label}</span>
                            {chosen && (
                              <span className="ml-auto text-xs font-bold text-brand">Your answer</span>
                            )}
                          </div>
                        );
                      })}
                      {!ans && <p className="text-xs text-muted">No answer given.</p>}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg bg-canvas p-3 text-sm">
                      <p className="text-xs font-semibold text-muted">Your answer</p>
                      <p className="mt-1 whitespace-pre-wrap text-ink">
                        {ans.trim() || "— (no answer given)"}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <p className="mt-6 text-xs text-muted">
            This shows the answers you submitted. Marks and the correct answers are part of your
            graded result and paid tiers.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
