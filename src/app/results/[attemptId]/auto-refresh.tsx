"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// While grading is in progress, re-fetch the server component every few seconds
// so the result appears on its own — no manual refresh.
export function AutoRefresh({ seconds = 4 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
