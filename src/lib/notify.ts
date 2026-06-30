export type ResultPayload = {
  candidate_id: string | null;
  email: string;
  name: string;
  course: string;
  quiz: string;
  score: number;
  max_score: number;
  percentage: number;
  passed: boolean;
  band: string;
  started_at: string | null;
  submitted_at: string | null;
  duration: string;
  date: string;
  tier: number;
  upgrade_html: string;
};

// Fire-and-forget POST to the n8n webhook that sends the result email.
// No-ops (with a log) if the webhook isn't configured yet, so grading never breaks.
export async function sendResultToN8n(payload: ResultPayload) {
  const url = process.env.N8N_RESULT_WEBHOOK_URL;
  if (!url) {
    console.log("N8N_RESULT_WEBHOOK_URL not set — skipping result email.");
    return;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error("n8n result webhook returned", res.status);
  } catch (e) {
    console.error("n8n result webhook failed", e);
  }
}
