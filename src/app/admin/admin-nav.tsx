"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Overview", exact: true, match: ["/admin"] },
  { href: "/admin/generate", label: "AI Quiz Generator", match: ["/admin/generate"] },
  { href: "/admin/courses", label: "Courses", match: ["/admin/courses", "/admin/quizzes"] },
  { href: "/admin/results", label: "Results", match: ["/admin/results"] },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1 text-sm font-semibold">
      {TABS.map((t) => {
        const active = t.exact
          ? path === t.href
          : t.match.some((m) => path.startsWith(m));
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`block rounded-lg px-3 py-2 transition-colors ${
              active
                ? "bg-white/15 text-white"
                : "text-brand-light hover:bg-white/10 hover:text-white"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
