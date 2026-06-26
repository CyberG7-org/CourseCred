import { createClient } from "@/lib/supabase/server";
import { GenerateForm } from "./generate-form";

export const maxDuration = 60;
export const metadata = { title: "AI Quiz Generator — Admin" };

export default async function GeneratePage() {
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select("id, title")
    .order("title");

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">AI Quiz Generator</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Generate a draft quiz from a topic — optionally grounded in source material
        you paste. It lands in the item bank as <strong>review</strong> for you to
        check before publishing.
      </p>
      <GenerateForm courses={courses ?? []} />
    </div>
  );
}
