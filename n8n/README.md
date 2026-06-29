# CourseCred — Result Email (n8n)

Sends the candidate's Tier-1 result email when a quiz is graded. The Next.js app POSTs
the result JSON to this workflow's webhook; the workflow emails the candidate.

## Files

- `examcert-result-email.workflow.json` — importable n8n workflow (Webhook → Send Email)
- `result-email.html` — the email template (n8n expressions, editable)

## Setup

1. **Import** `examcert-result-email.workflow.json` into n8n (Workflows → Import from File).
2. Open the **Send Result Email** node:
   - Connect your email **credential** — an **SMTP** credential works out of the box
     (e.g. Gmail SMTP with an app password). Prefer the Gmail or SendGrid node? Say so and
     I'll swap it.
   - Confirm the **From** address.
3. **Activate** the workflow, then copy its **Production webhook URL**
   (ends in `/webhook/examcert-result`).
4. Add that URL as **`N8N_RESULT_WEBHOOK_URL`** in **Vercel → Settings → Environment
   Variables** (Production) and in local `.env.local`, then redeploy.
5. **Test:** submit a quiz as a candidate (or POST the sample payload below to the webhook).

## Payload (what the webhook receives)

```json
{
  "candidate_id": "EC-DOQTZ5",
  "email": "candidate@example.com",
  "name": "Jane Doe",
  "course": "Cybersecurity Basics",
  "quiz": "1.0 Cybersecurity Basics",
  "score": 72,
  "max_score": 100,
  "percentage": 72,
  "passed": true,
  "band": "Good",
  "started_at": "2026-06-26T15:54:00Z",
  "submitted_at": "2026-06-26T16:40:00Z",
  "duration": "46m 0s",
  "date": "26 June 2026"
}
```

The template uses `name`, `candidate_id`, `email`, `course`, `date`, and `passed`
(PASS/FAIL). The `score` / `percentage` / `band` fields are included for the paid-tier
emails later.

## Notes

- Result shows **PASS in green / FAIL in red** (your original showed FAIL in blue — say
  the word to switch back).
- The **Upgrade to Tier 2/3/4** buttons link to `#` for now; they'll point to Stripe
  checkout links once paid tiers (roadmap item #5) are built. Send an `upgrade_url` in the
  payload or edit the HTML to wire them sooner.
- Expressions assume the webhook body is at `{{ $json.body.* }}`. If your n8n version
  nests it differently, adjust the Send Email node's expressions.
