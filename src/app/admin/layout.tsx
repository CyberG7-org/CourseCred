import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/dashboard");

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-brand-dark p-5 text-white">
        <Link href="/admin" className="text-xl font-extrabold">
          ExamCert <span className="text-brand-light">Admin</span>
        </Link>
        <nav className="mt-8 flex flex-col gap-1 text-sm font-semibold">
          <Link href="/admin" className="rounded-lg px-3 py-2 hover:bg-white/10">
            Overview
          </Link>
          <Link href="/admin/generate" className="rounded-lg px-3 py-2 hover:bg-white/10">
            AI Quiz Generator
          </Link>
          <Link href="/admin/courses" className="rounded-lg px-3 py-2 hover:bg-white/10">
            Courses
          </Link>
        </nav>
        <div className="mt-auto pt-6 text-xs text-brand-light">
          <p className="truncate">{profile?.full_name ?? user.email}</p>
          <Link href="/dashboard" className="mt-2 block hover:underline">
            ← Candidate view
          </Link>
          <div className="mt-1 -ml-3 text-white/90">
            <LogoutButton />
          </div>
        </div>
      </aside>
      <main className="flex-1 bg-canvas p-8">{children}</main>
    </div>
  );
}
