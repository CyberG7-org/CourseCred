import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

export async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data: p } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    isAdmin = p?.role === "admin";
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/" className="text-xl font-extrabold text-brand-dark">
          CourseCred
        </Link>
        <nav className="flex items-center gap-1 text-sm font-semibold">
          <Link href="/courses" className="rounded-lg px-3 py-2 text-ink hover:bg-canvas">
            Courses
          </Link>
          <Link href="/verify" className="rounded-lg px-3 py-2 text-ink hover:bg-canvas">
            Verify
          </Link>
          {user ? (
            <>
              {isAdmin ? (
                <Link href="/admin" className="rounded-lg px-3 py-2 text-ink hover:bg-canvas">
                  Admin
                </Link>
              ) : (
                <Link href="/dashboard" className="rounded-lg px-3 py-2 text-ink hover:bg-canvas">
                  Dashboard
                </Link>
              )}
              <LogoutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-brand px-4 py-2 text-white hover:bg-brand-dark"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
