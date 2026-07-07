import { getSectionsWithAnalysis } from "@/lib/section-analysis";

// Async server component — streamed inside <Suspense> so the result page paints
// immediately while the (cached-after-first-time) AI analysis resolves.
export async function SectionBreakdown({ attemptId }: { attemptId: string }) {
  const sections = await getSectionsWithAnalysis(attemptId);
  if (!sections.length) return null;

  return (
    <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
      <h2 className="font-bold text-brand-dark">Section analysis</h2>
      <div className="mt-3 space-y-4">
        {sections.map((s) => (
          <div key={s.section_no} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-brand-dark">Section {s.section_no}</span>
              <span className="shrink-0 rounded-full bg-canvas px-2.5 py-1 text-xs font-bold text-ink">
                {s.awarded} / {s.max}
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.analysis}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SectionBreakdownSkeleton() {
  return (
    <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
      <h2 className="font-bold text-brand-dark">Section analysis</h2>
      <div className="mt-3 space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="animate-pulse border-t border-line pt-3 first:border-t-0 first:pt-0">
            <div className="h-4 w-24 rounded bg-line" />
            <div className="mt-2 h-3 w-full rounded bg-line" />
            <div className="mt-1.5 h-3 w-2/3 rounded bg-line" />
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">Analysing your answers…</p>
    </div>
  );
}
