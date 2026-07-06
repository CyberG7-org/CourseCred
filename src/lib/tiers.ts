// Single source of truth for the paid tiers: Stripe Payment Links + copy.
// Used by both the result email (rendered HTML) and the candidate portal (JSX).

export const TIER_LINKS: Record<number, string> = {
  2: "https://buy.stripe.com/4gMcN67E37ZY2WP7Vs33W0n",
  3: "https://buy.stripe.com/14AaEY5vVfsqcxp2B833W0o",
  4: "https://buy.stripe.com/14AeVe1fF942fJB8Zw33W0p",
};

export const TIER_INFO: Record<number, { title: string; desc: string; color: string }> = {
  2: {
    title: "Tier 2 – Section Breakdown",
    desc: "See your score and pass/fail result for every section of the assessment.",
    color: "#2563eb",
  },
  3: {
    title: "Tier 3 – Ranking & Comparison Report",
    desc: "See your percentile ranking and how you compare with other candidates.",
    color: "#16a34a",
  },
  4: {
    title: "Tier 4 – Full Academic Diagnostic",
    desc: "Unlock detailed graphs, section analysis, strengths identification, score breakdowns, and improvement insights.",
    color: "#dc2626",
  },
};

export function tiersAbove(currentTier: number): number[] {
  return [2, 3, 4].filter((t) => t > currentTier);
}

// Stripe Payment Link + the context the webhook needs: who paid (candidate code)
// and which tier (encoded in client_reference_id as "<code>__<tier>").
export function upgradeUrl(tier: number, candidateCode: string, email: string): string {
  const ref = encodeURIComponent(`${candidateCode}__${tier}`);
  const e = encodeURIComponent(email);
  return `${TIER_LINKS[tier]}?client_reference_id=${ref}&prefilled_email=${e}`;
}

// Email upgrade section: only the tiers above the candidate's current one.
export function renderUpgradeHtml(currentTier: number, candidateCode: string, email: string): string {
  const tiers = tiersAbove(currentTier);
  if (tiers.length === 0) return "";
  const blocks = tiers
    .map((t) => {
      const i = TIER_INFO[t];
      const title = t === 3 ? i.title.replace("&", "&amp;") : i.title;
      return `<div style="margin:0 0 20px;">
      <div style="font-size:14px;font-weight:bold;color:#111827;">${title}</div>
      <div style="font-size:13px;color:#6b7280;margin:4px 0 10px;">${i.desc}</div>
      <a href="${upgradeUrl(t, candidateCode, email)}" style="display:inline-block;background:${i.color};color:#ffffff;text-decoration:none;font-size:13px;font-weight:bold;padding:10px 18px;border-radius:8px;">Upgrade to Tier ${t}</a>
    </div>`;
    })
    .join("\n    ");
  return `<h2 style="margin:0 0 16px;font-size:16px;font-weight:bold;color:#111827;">Unlock Your Full Performance Report</h2>
    ${blocks}`;
}
