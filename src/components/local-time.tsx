"use client";

import { useEffect, useState } from "react";

// Renders an ISO timestamp in the viewer's own locale + timezone. Server output
// would be UTC, so we render after mount and suppress the hydration diff.
export function LocalTime({ iso }: { iso: string | null }) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (iso) {
      setText(new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }));
    }
  }, [iso]);
  if (!iso) return <span>—</span>;
  return <span suppressHydrationWarning>{text || "…"}</span>;
}
