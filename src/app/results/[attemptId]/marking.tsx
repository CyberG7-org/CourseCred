"use client";

import { useEffect, useState } from "react";

// "Marking in progress" visual: an answer sheet whose answers get ticked off,
// plus a percentage progress bar. Grading runs server-side with no granular
// progress, so the % eases toward ~95% and the page flips to the result the
// moment grading finishes (see AutoRefresh).
export function Marking() {
  const [pct, setPct] = useState(8);
  useEffect(() => {
    const id = setInterval(() => {
      setPct((p) => (p >= 95 ? 95 : Math.min(95, p + Math.max(0.4, (95 - p) * 0.06))));
    }, 200);
    return () => clearInterval(id);
  }, []);
  const shown = Math.round(pct);

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <style>{`
        .mk-sheet { animation: mk-float 3s ease-in-out infinite; transform-origin: center; }
        @keyframes mk-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        .mk-check { stroke-dasharray: 16; animation: mk-draw 2.1s ease-in-out infinite; }
        @keyframes mk-draw {
          0%   { stroke-dashoffset: 16; opacity: 0; }
          18%  { opacity: 1; }
          45%  { stroke-dashoffset: 0; opacity: 1; }
          82%  { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .mk-sheet, .mk-check { animation: none; }
          .mk-check { stroke-dashoffset: 0; opacity: 1; }
        }
      `}</style>

      <svg className="mk-sheet h-28 w-28" viewBox="0 0 140 130" fill="none" aria-hidden="true">
        <rect x="32" y="12" width="76" height="106" rx="10" fill="#ffffff" stroke="var(--color-line)" strokeWidth="2" />
        <rect x="46" y="26" width="34" height="6" rx="3" fill="var(--color-line)" />
        {[52, 74, 96].map((y, i) => (
          <g key={y}>
            <circle cx="52" cy={y} r="9" fill="#dcfce7" />
            <path
              className="mk-check"
              style={{ animationDelay: `${i * 0.35}s` }}
              d={`M47.5 ${y} l3.5 3.5 l6 -7`}
              stroke="#16a34a"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x="68" y={y - 3} width="34" height="5" rx="2.5" fill="var(--color-line)" />
          </g>
        ))}
      </svg>

      <div className="w-full max-w-xs">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="text-muted">Marking…</span>
          <span className="tabular-nums text-brand-dark">{shown}%</span>
        </div>
        <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-brand transition-all duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
