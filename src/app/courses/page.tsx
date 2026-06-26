import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export const metadata = { title: "Courses — ExamCert" };

type Quiz = { id: string; title: string };
type Course = {
  id: string;
  title: string;
  description: string | null;
  quizzes: Quiz[] | null;
};

export default async function CoursesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("courses")
    .select("id, title, description, quizzes(id, title)")
    .eq("status", "published")
    .order("title");

  const courses = (data ?? []) as Course[];

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <h1 className="text-3xl font-bold text-brand-dark">Courses</h1>
          <p className="mt-2 text-muted">
            Pick a course and take its assessment.
          </p>

          {courses.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-dashed border-line bg-white p-12 text-center text-muted">
              No published courses yet. Once an admin publishes a course, it
              shows up here.
            </div>
          ) : (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col rounded-2xl border border-line bg-white p-6 shadow-sm"
                >
                  <h2 className="text-lg font-bold text-ink">{c.title}</h2>
                  <p className="mt-2 line-clamp-3 text-sm text-muted">
                    {c.description ?? "AI-generated assessment."}
                  </p>
                  <div className="mt-4 space-y-2">
                    {c.quizzes && c.quizzes.length > 0 ? (
                      c.quizzes.map((q) => (
                        <div
                          key={q.id}
                          className="flex items-center justify-between rounded-xl bg-canvas px-3 py-2 text-sm"
                        >
                          <span className="font-semibold text-ink">
                            {q.title}
                          </span>
                          <button
                            disabled
                            title="Quiz runner ships in the next update"
                            className="cursor-not-allowed rounded-lg bg-brand/40 px-3 py-1 text-xs font-bold text-white"
                          >
                            Start
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted">No quiz published yet.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
