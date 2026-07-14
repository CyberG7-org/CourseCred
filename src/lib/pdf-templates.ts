import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";

// Both Slides templates are 1060.5 × 1500 pt portrait, with all artwork baked
// into a full-bleed PNG. We draw that PNG, then overlay the live values at the
// exact coordinates pulled from the template OOXML (x,y measured from top-left).
const PAGE_W = 1060.5;
const PAGE_H = 1500;
const GOLD = rgb(0.706, 0.373, 0.024); // #B45F06 — the colour used for live text

type Bg = ArrayBuffer | Uint8Array;

type Tier3Section = {
  section_no: number;
  awarded: number;
  max: number;
  performance_analysis: string;
  strengths: string[];
  weaknesses: string[];
};

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
  // Text auto-fits: start at the template's 18pt and shrink only when that
  // section's verdict won't fit its cell; wrapped + vertically centred.
  const ROW_TOP = [655.4, 758.7, 862.1, 965.4];
  const CELL_H = 103.3;
  const CELL_X = 286;
  const CELL_W = 590;
  for (let i = 0; i < 4; i++) {
    const s = d.sections[i];
    if (!s) continue;
    const text = s.analysis ?? analysisFor(s.awarded, s.max);
    let fs = 18;
    let lh = fs * 1.25;
    let lines = wrapText(text, font, fs, CELL_W);
    for (const size of [18, 16, 14, 12]) {
      fs = size;
      lh = fs * 1.25;
      lines = wrapText(text, font, fs, CELL_W);
      if (lines.length * lh <= CELL_H - 12) break;
    }
    lines = lines.slice(0, Math.floor((CELL_H - 12) / lh));
    const top0 = ROW_TOP[i] + (CELL_H - lines.length * lh) / 2;
    lines.forEach((ln, j) =>
      page.drawText(ln, {
        x: CELL_X,
        y: PAGE_H - (top0 + lh * (j + 1) - fs * 0.25),
        size: fs,
        font,
        color: GOLD,
      }),
    );
  }

  left(d.grade, 28, 249.8, 1089.9, 57.1, bold);

  return pdf.save();
}

// ---------------- Tier 3 ranking & comparison report ----------------
export async function buildTier3ReportPdf(d: {
  name: string;
  candidateId: string;
  course: string;
  date: string;
  score: string;
  sections: Tier3Section[];
  bgBytes: [Bg, Bg, Bg];
  chartBytes: Bg;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const backgrounds = await Promise.all(d.bgBytes.map((bg) => pdf.embedPng(bg)));
  const chart = await pdf.embedPng(d.chartBytes);
  const pages = backgrounds.map((bg) => {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    page.drawImage(bg, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    return page;
  });

  const drawLeft = (
    pageIndex: number,
    text: string,
    size: number,
    x: number,
    top: number,
    f: PDFFont = font,
    color = GOLD,
  ) => {
    pages[pageIndex].drawText(text, {
      x,
      y: PAGE_H - top - size,
      size,
      font: f,
      color,
    });
  };

  drawLeft(0, d.name, 28, 263, 355);
  drawLeft(0, d.candidateId, 28, 344, 418);
  drawLeft(0, d.date, 28, 377, 487);
  drawLeft(0, d.course, 28, 344, 550);
  drawLeft(0, d.score, 28, 252, 612);

  const bySection = new Map(d.sections.map((s) => [s.section_no, s]));
  const blockRects: Record<number, { page: number; x: number; top: number; w: number; h: number }> = {
    1: { page: 0, x: 282, top: 760, w: 600, h: 455 },
    2: { page: 1, x: 288, top: 225, w: 600, h: 425 },
    3: { page: 1, x: 288, top: 828, w: 600, h: 425 },
    4: { page: 2, x: 288, top: 212, w: 600, h: 395 },
  };

  const renderBlock = (sectionNo: number) => {
    const s = bySection.get(sectionNo);
    if (!s) return;
    const rect = blockRects[sectionNo];
    const page = pages[rect.page];

    const parts: { text: string; bold?: boolean; indent?: number }[] = [
      { text: `Section Score: ${s.awarded}/${s.max}`, bold: true },
      { text: `Performance Analysis: ${s.performance_analysis}` },
      { text: "Strengths:", bold: true },
      ...s.strengths.map((item) => ({ text: `- ${item}`, indent: 14 })),
      { text: "Weaknesses:", bold: true },
      ...s.weaknesses.map((item) => ({ text: `- ${item}`, indent: 14 })),
    ];

    for (const size of [17, 16, 15, 14, 13, 12, 11]) {
      const lineHeight = size * 1.18;
      const lines = parts.flatMap((part) =>
        wrapText(part.text, part.bold ? bold : font, size, rect.w - (part.indent ?? 0)).map((line) => ({
          line,
          bold: part.bold,
          indent: part.indent ?? 0,
        })),
      );
      if (lines.length * lineHeight <= rect.h - 22 || size === 11) {
        const maxLines = Math.floor((rect.h - 22) / lineHeight);
        lines.slice(0, maxLines).forEach((line, i) => {
          page.drawText(line.line, {
            x: rect.x + line.indent,
            y: PAGE_H - (rect.top + 16 + lineHeight * (i + 1) - size * 0.25),
            size,
            font: line.bold ? bold : font,
            color: GOLD,
          });
        });
        break;
      }
    }
  };

  [1, 2, 3, 4].forEach(renderBlock);

  // Page 3 chart replaces the placeholder illustration area.
  pages[2].drawImage(chart, { x: 185, y: PAGE_H - 1205, width: 690, height: 414 });

  return pdf.save();
}
