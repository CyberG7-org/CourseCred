import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
import { AdminNav } from "./admin-nav";

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
      <aside className="flex w-60 shrink-0 flex-col border-r-2 border-brand-accent bg-brand-dark p-5 text-white">
        <Link href="/admin" className="text-xl font-extrabold">
          ExamCert <span className="text-brand-light">Admin</span>
        </Link>
        <div className="mt-8">
          <AdminNav />
        </div>
        <div className="mt-auto border-t border-white/10 pt-4 text-sm">
          <p className="truncate text-brand-light">{profile?.full_name || user.email}</p>
          <LogoutButton className="mt-1 -ml-2 rounded-lg px-2 py-1.5 font-semibold text-brand-light hover:bg-white/10 hover:text-white" />
        </div>
      </aside>
      <main className="flex-1 bg-canvas p-8">{children}</main>
    </div>
  );
}
