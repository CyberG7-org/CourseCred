"use client";

// Renders the attempt's start/finish in the candidate's own locale + timezone
// (server-rendered times would show UTC), plus the elapsed duration.
export function ResultTimes({
  startedAt,
  submittedAt,
}: {
  startedAt: string;
  submittedAt: string | null;
}) {
  const start = new Date(startedAt);
  const end = submittedAt ? new Date(submittedAt) : null;
  const fmt = (d: Date) => d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  let taken = "—";
  if (end) {
    const s = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    taken = `${h > 0 ? `${h}h ` : ""}${m}m ${sec}s`;
  }

  return (
    <div>
      <Row label="Started" value={fmt(start)} />
      <Row label="Submitted" value={end ? fmt(end) : "—"} />
      <Row label="Time taken" value={taken} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-line py-2 text-sm first:border-t-0">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}
