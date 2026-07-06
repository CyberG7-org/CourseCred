import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";

// Both Slides templates are 1060.5 × 1500 pt portrait, with all artwork baked
// into a full-bleed PNG. We draw that PNG, then overlay the live values at the
// exact coordinates pulled from the template OOXML (x,y measured from top-left).
const PAGE_W = 1060.5;
const PAGE_H = 1500;
const GOLD = rgb(0.706, 0.373, 0.024); // #B45F06 — the colour used for live text

type Bg = ArrayBuffer | Uint8Array;

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (cur && font.widthOfTextAtSize(test, size) > maxWidth) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Rule-based section verdict (band + short explanation), used only as a fallback
// when the AI-written analysis is unavailable.
function analysisFor(awarded: number, max: number): string {
  const pct = max ? (awarded / max) * 100 : 0;
  if (pct >= 80)
    return "Excellent — outstanding, comprehensive performance with accurate answers across this section.";
  if (pct >= 60) return "Good — a solid understanding overall, with a few areas to strengthen.";
  if (pct >= 40) return "Fair — a mixed result; several questions in this section need review.";
  return "Poor — a low score, with multiple questions missed or left unanswered. Revisit this section's material.";
}

// ---------------- Certificate ----------------
export async function buildCertPdf(d: {
  name: string;
  candidateId: string;
  course: string;
  date: string;
  verifyUrl: string;
  bgBytes: Bg;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bg = await pdf.embedPng(d.bgBytes);
  page.drawImage(bg, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });

  const centered = (text: string, size: number, baselineFromTop: number) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: PAGE_W / 2 - w / 2,
      y: PAGE_H - baselineFromTop,
      size,
      font,
      color: GOLD,
    });
  };

  centered(d.name, 39.9, 690);
  centered(d.candidateId, 30, 735);
  centered(d.course, 30, 860);
  centered(`On ${d.date}`, 30, 898);

  const qrBuf = await QRCode.toBuffer(d.verifyUrl, { margin: 1, width: 300 });
  const qr = await pdf.embedPng(qrBuf);
  page.drawImage(qr, { x: 480, y: PAGE_H - 1333.5 - 100.5, width: 100.5, height: 100.5 });

  return pdf.save();
}

// ---------------- Tier 2 performance report ----------------
export async function buildReportPdf(d: {
  name: string;
  candidateId: string;
  course: string;
  date: string;
  sections: { section_no: number; awarded: number; max: number; analysis?: string }[];
  grade: string; // PASS / FAIL
  bgBytes: Bg;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const bg = await pdf.embedPng(d.bgBytes);
  page.drawImage(bg, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });

  const left = (
    text: string,
    size: number,
    x: number,
    topY: number,
    h: number,
    f: PDFFont = font,
  ) =>
    page.drawText(text, { x, y: PAGE_H - topY - h / 2 - size * 0.35, size, font: f, color: GOLD });

  left(d.name, 28, 256.3, 340.1, 57.1);
  left(d.candidateId, 28, 337.3, 401.7, 57.1);
  left(d.date, 28, 370.4, 470.7, 57.1);
  left(d.course, 28, 337.3, 533.0, 57.1);

  // Fill the template's baked 4-row Section table — one section per row (max 4).
  // Each verdict is wrapped and vertically centred inside its cell.
  const ROW_TOP = [655.4, 758.7, 862.1, 965.4];
  const CELL_H = 103.3;
  const CELL_X = 286;
  const CELL_W = 590;
  const FS = 12;
  const LH = 14.5;
  for (let i = 0; i < 4; i++) {
    const s = d.sections[i];
    if (!s) continue;
    const lines = wrapText(s.analysis ?? analysisFor(s.awarded, s.max), font, FS, CELL_W).slice(0, 6);
    const top0 = ROW_TOP[i] + (CELL_H - lines.length * LH) / 2;
    lines.forEach((ln, j) =>
      page.drawText(ln, {
        x: CELL_X,
        y: PAGE_H - (top0 + LH * (j + 1) - 3),
        size: FS,
        font,
        color: GOLD,
      }),
    );
  }

  left(d.grade, 28, 249.8, 1089.9, 57.1, bold);

  return pdf.save();
}
