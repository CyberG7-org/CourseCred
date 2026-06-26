import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createCourse, setCourseStatus } from "../actions";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Courses — Admin" };

type Course = {
  id: string;
  title: string;
  status: string;
  quizzes: { id: string }[] | null;
};

export default async function AdminCourses() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("courses")
    .select("id, title, status, quizzes(id)")
    .order("created_at", { ascending: false });
  const courses = (data ?? []) as Course[];

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Courses</h1>

      <form action={createCourse} className="mt-6 flex max-w-xl gap-2">
        <input
          name="title"
          required
          placeholder="New course title"
          className="flex-1 rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-brand-accent"
        />
        <SubmitButton
          className="rounded-xl bg-brand px-5 py-2.5 font-bold text-white hover:bg-brand-dark"
          pendingText="Adding…"
        >
          Add course
        </SubmitButton>
      </form>

      <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-5 py-3 font-semibold">Course</th>
              <th className="px-5 py-3 font-semibold">Quizzes</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {courses.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-muted">
                  No courses yet. Add one above, or create one from the AI Quiz Generator.
                </td>
              </tr>
            ) : (
              courses.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-semibold">
                    <Link
                      href={`/admin/courses/${c.id}`}
                      className="text-brand-dark hover:text-brand hover:underline"
                    >
                      {c.title}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted">{c.quizzes?.length ?? 0}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        c.status === "published"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <form
                      action={setCourseStatus.bind(
                        null,
                        c.id,
                        c.status === "published" ? "draft" : "published",
                      )}
                    >
                      <SubmitButton
                        className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-brand hover:bg-canvas"
                        pendingText="…"
                      >
                        {c.status === "published" ? "Unpublish" : "Publish"}
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
