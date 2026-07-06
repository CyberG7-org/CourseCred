import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildCertPdf } from "@/lib/pdf-templates";

export const runtime = "nodejs";

function genSerial() {
  const yr = new Date().getFullYear();
  return `CC-${yr}-${randomBytes(4).toString("hex").toUpperCase().slice(0, 6)}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Free Tier-1 benefit: any candidate who PASSED can download an official
// certificate. We mint a verifiable certificate record (serial + verify_id) on
// first download, then render the PDF from the branded Slides artwork.
export async function GET(req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Sign in to download your certificate.", { status: 401 });

  const { data: a } = await supabase
    .from("attempts")
    .select("id, user_id, quiz_id, passed, candidate_code")
    .eq("id", attemptId)
    .single();
  if (!a || a.user_id !== user.id) return new Response("Certificate not found.", { status: 404 });
  if (!a.passed) {
    return new Response("A certificate is only issued for a passing result.", { status: 403 });
  }

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("course_id, courses(title)")
    .eq("id", a.quiz_id)
    .single();
  const courseEmbed = (quiz as { courses?: { title: string } | { title: string }[] } | null)
    ?.courses;
  const course = Array.isArray(courseEmbed) ? courseEmbed[0] : courseEmbed;

  const { data: prof } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
  const name = prof?.full_name?.trim() || user.email?.split("@")[0] || "Candidate";

  // Mint (idempotent on attempt_id) then read back the canonical serial/verify_id.
  const svc = createServiceClient();
  await svc.from("certificates").upsert(
    {
      attempt_id: a.id,
      user_id: a.user_id,
      course_id: quiz?.course_id,
      serial: genSerial(),
      verify_id: randomBytes(10).toString("hex"),
    },
    { onConflict: "attempt_id", ignoreDuplicates: true },
  );
  const { data: cert } = await svc
    .from("certificates")
    .select("serial, verify_id, issued_at, revoked")
    .eq("attempt_id", a.id)
    .single();
  if (!cert || cert.revoked) return new Response("Certificate unavailable.", { status: 409 });

  const origin = new URL(req.url).origin;
  const bgBytes = await fetch(`${origin}/cert-bg.png`).then((r) => r.arrayBuffer());
  const bytes = await buildCertPdf({
    name,
    candidateId: a.candidate_code ?? cert.serial,
    course: course?.title ?? "Assessment",
    date: fmtDate(cert.issued_at),
    verifyUrl: `${origin}/verify?id=${cert.verify_id}`,
    bgBytes,
  });

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="CourseCred-Certificate-${cert.serial}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
