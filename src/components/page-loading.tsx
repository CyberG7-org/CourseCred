// Shown by route-level loading.tsx files during navigation + post-redirect waits.
// On-brand animated "thinking brain": strokes sketch themselves on a loop,
// synapse nodes pulse, and a soft halo breathes. Pure CSS — no client JS.
export function PageLoading({ label = "Loading…" }: { label?: string }) {
  const half = (
    <>
      <path
        className="ec-stroke"
        pathLength={100}
        d="M60 24 C64 17 75 16 80 23 C90 22 96 31 91 39 C99 43 99 55 90 59 C93 68 84 77 74 73 C70 80 62 81 60 80"
      />
      <path className="ec-stroke" pathLength={100} style={{ animationDelay: ".15s" }} d="M60 33 C70 34 72 43 64 47" />
      <path className="ec-stroke" pathLength={100} style={{ animationDelay: ".3s" }} d="M63 52 C72 53 74 61 66 64" />
      <path className="ec-stroke" pathLength={100} style={{ animationDelay: ".25s" }} d="M80 30 C83 37 79 44 72 43" />
    </>
  );

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5">
      <style>{`
        @keyframes ec-draw {
          0% { stroke-dashoffset: 100; opacity: .35; }
          12% { opacity: 1; }
          45%, 55% { stroke-dashoffset: 0; opacity: 1; }
          90% { opacity: .35; }
          100% { stroke-dashoffset: -100; opacity: .35; }
        }
        @keyframes ec-halo {
          0%, 100% { opacity: .14; transform: scale(.88); }
          50% { opacity: .4; transform: scale(1.08); }
        }
        @keyframes ec-node { 0%, 100% { opacity: .15; } 50% { opacity: 1; } }
        @keyframes ec-text { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
        .ec-brain { width: 140px; height: 140px; }
        .ec-halo { transform-box: fill-box; transform-origin: center; animation: ec-halo 2.6s ease-in-out infinite; }
        .ec-stroke { stroke-dasharray: 100; animation: ec-draw 2.8s ease-in-out infinite; }
        .ec-node { animation: ec-node 1.6s ease-in-out infinite; }
        .ec-label { animation: ec-text 1.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ec-halo, .ec-stroke, .ec-node, .ec-label { animation: none; }
          .ec-stroke { stroke-dashoffset: 0; opacity: 1; }
          .ec-halo { opacity: .3; }
        }
      `}</style>

      <svg className="ec-brain" viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <circle className="ec-halo" cx="60" cy="54" r="44" fill="var(--color-brand-light)" />
        <g
          stroke="var(--color-brand)"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            className="ec-stroke"
            pathLength={100}
            d="M60 24 C57 36 63 44 60 56 C57 67 62 73 60 80"
          />
          <g>{half}</g>
          <g transform="matrix(-1,0,0,1,120,0)">{half}</g>
        </g>
        <g fill="var(--color-brand-accent)">
          <circle className="ec-node" cx="60" cy="23" r="3.2" />
          <circle className="ec-node" cx="64" cy="47" r="2.6" style={{ animationDelay: ".2s" }} />
          <circle className="ec-node" cx="56" cy="47" r="2.6" style={{ animationDelay: ".5s" }} />
          <circle className="ec-node" cx="66" cy="64" r="2.6" style={{ animationDelay: ".35s" }} />
          <circle className="ec-node" cx="54" cy="64" r="2.6" style={{ animationDelay: ".7s" }} />
          <circle className="ec-node" cx="60" cy="80" r="3.2" style={{ animationDelay: ".55s" }} />
        </g>
      </svg>

      <p className="ec-label text-base font-bold text-brand-dark">{label}</p>
    </div>
  );
}
