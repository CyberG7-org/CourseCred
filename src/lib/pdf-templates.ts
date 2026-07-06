import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";

// Both Slides templates are 1060.5 × 1500 pt portrait, with all artwork baked
// into a full-bleed PNG. We draw that PNG, then overlay the live values at the
// exact coordinates pulled from the template OOXML (x,y measured from top-left).
const PAGE_W = 1060.5;
const PAGE_H = 1500;
const GOLD = rgb(0.706, 0.373, 0.024); // #B45F06 — the colour used for live text
const CREAM = rgb(0.968, 0.953, 0.925); // paper tone, to mask the baked table grid
const INK = rgb(0.15, 0.13, 0.11);

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

// Rule-based section verdict (band + short explanation, no raw score).
function analysisFor(awarded: number, max: number): string {
  const pct = max ? (awarded / max) * 100 : 0;
  if (pct >= 80)
    return "Excellent — outstanding, comprehensive performance with accurate answers across this section.";
  if (pct >= 60)
    return "Good — a solid understanding overall, with a few areas to strengthen.";
  if (pct >= 40)
    return "Fair — a mixed result; several questions in this section need review.";
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

  // --- dynamic Section Analysis: mask the baked 4-row grid, then draw a
  //     content-fit box with one row per real section (any count supported) ---
  const COVER_TOP = 630; // just below the baked "Section Analysis :" heading
  const COVER_BOTTOM = 1072; // hides the whole baked grid down to the "Grade :" line
  const AREA_TOP = 640;
  page.drawRectangle({
    x: 60,
    y: PAGE_H - COVER_BOTTOM,
    width: 940,
    height: COVER_BOTTOM - COVER_TOP,
    color: CREAM,
  });

  const labelX = 82;
  const textX = 250;
  const textW = 720;
  const sections = d.sections.length
    ? d.sections
    : [{ section_no: 1, awarded: 0, max: 0, analysis: "No section data available." }];
  const measured = sections.map((s) => {
    const lines = wrapText(s.analysis ?? analysisFor(s.awarded, s.max), font, 13, textW);
    return { s, lines, h: Math.max(lines.length * 16 + 24, 58) };
  });
  const shown: typeof measured = [];
  let totalH = 0;
  for (const m of measured) {
    if (AREA_TOP + totalH + m.h > COVER_BOTTOM - 8) break; // never overflow
    shown.push(m);
    totalH += m.h;
  }

  page.drawRectangle({
    x: 62,
    y: PAGE_H - AREA_TOP - totalH - 2,
    width: 936,
    height: totalH + 4,
    borderColor: GOLD,
    borderWidth: 1.2,
  });

  let rowTop = AREA_TOP + 12;
  shown.forEach((m, i) => {
    page.drawText(`Section ${m.s.section_no}`, {
      x: labelX,
      y: PAGE_H - (rowTop + 18),
      size: 15,
      font: bold,
      color: GOLD,
    });
    m.lines.forEach((ln, j) =>
      page.drawText(ln, {
        x: textX,
        y: PAGE_H - (rowTop + 16 + j * 16),
        size: 13,
        font,
        color: INK,
      }),
    );
    if (i < shown.length - 1) {
      page.drawRectangle({
        x: 72,
        y: PAGE_H - (rowTop + m.h),
        width: 916,
        height: 0.6,
        color: rgb(0.85, 0.82, 0.75),
      });
    }
    rowTop += m.h;
  });

  left(d.grade, 28, 249.8, 1089.9, 57.1, bold);

  return pdf.save();
}
