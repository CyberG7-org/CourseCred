import Anthropic from "@anthropic-ai/sdk";

// Lazily constructed so the module imports cleanly (e.g. at build time) even
// when ANTHROPIC_API_KEY is unset — the key is only needed when generating.
let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it in Vercel → Settings → Environment Variables (and .env.local for local dev).",
      );
    }
    _client = new Anthropic();
  }
  return _client;
}

export type GenInput = {
  topic: string;
  knowledgeBase?: string;
  pdfBase64?: string;
  difficulty: "easy" | "medium" | "hard";
  sections: number;
  mcqPerSection: number;
  shortPerSection: number;
  longPerSection: number;
};

export type GenQuestion = {
  type: "mcq" | "true_false" | "short" | "long";
  marks: number;
  stem: string;
  options: { key: string; label: string }[];
  correct_answer: string;
  model_answer: string;
  rubric: { points: number; criterion: string }[];
};
export type GenSection = { title: string; questions: GenQuestion[] };
export type GenQuiz = { sections: GenSection[] };

// Structured-output schema. Note: json_schema mode does not enforce min/max or
// item counts — those are stated in the prompt and re-validated in code.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          questions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                type: { type: "string", enum: ["mcq", "true_false", "short", "long"] },
                marks: { type: "integer" },
                stem: { type: "string" },
                options: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: { key: { type: "string" }, label: { type: "string" } },
                    required: ["key", "label"],
                  },
                },
                correct_answer: { type: "string" },
                model_answer: { type: "string" },
                rubric: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: { points: { type: "integer" }, criterion: { type: "string" } },
                    required: ["points", "criterion"],
                  },
                },
              },
              required: ["type", "marks", "stem", "options", "correct_answer", "model_answer", "rubric"],
            },
          },
        },
        required: ["title", "questions"],
      },
    },
  },
  required: ["sections"],
};

const SYSTEM = `You are an expert assessment designer producing fair, rigorous, unambiguous exam content.

Per-type rules (follow exactly):
- mcq: exactly 4 options labeled "A","B","C","D"; correct_answer is exactly one of "A"/"B"/"C"/"D"; marks = 1; model_answer = ""; rubric = [].
- true_false: options = [{"key":"true","label":"True"},{"key":"false","label":"False"}]; correct_answer = "true" or "false"; marks = 1; model_answer = ""; rubric = [].
- short: options = []; correct_answer = ""; marks = 2; model_answer = a concise ideal answer; rubric = point-by-point criteria whose points sum to 2.
- long: options = []; correct_answer = ""; marks = 5; model_answer = a model answer; rubric = criteria whose points sum to 5.

Content rules:
- If a KNOWLEDGE BASE is provided, ground EVERY question strictly in it — do not introduce outside facts. Otherwise use widely-accepted knowledge of the topic.
- No trick questions, no ambiguous wording, no "all/none of the above".
- Give each section a short descriptive title.
- Output must conform exactly to the provided JSON schema.`;

export async function generateQuiz(input: GenInput): Promise<GenQuiz> {
  const kb = input.knowledgeBase?.trim()
    ? `\n\nKNOWLEDGE BASE (ground all questions strictly in this material):\n${input.knowledgeBase.trim().slice(0, 60000)}`
    : "";
  const docNote = input.pdfBase64
    ? "\n\nGround all questions strictly in the ATTACHED document."
    : "";

  const userMsg =
    `Create a ${input.difficulty} quiz on the topic: "${input.topic}".\n` +
    `Produce exactly ${input.sections} section(s). In EACH section include exactly ` +
    `${input.mcqPerSection} mcq, ${input.shortPerSection} short, and ${input.longPerSection} long question(s).` +
    docNote +
    kb;

  const userBlocks: Anthropic.ContentBlockParam[] = [];
  if (input.pdfBase64) {
    userBlocks.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64 },
    });
  }
  userBlocks.push({ type: "text", text: userMsg });

  const res = await client().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content: userBlocks }],
    // output_config is the canonical structured-output parameter; spread keeps
    // the rest of the params strongly typed while injecting it.
    ...({ output_config: { format: { type: "json_schema", schema: SCHEMA } } } as object),
  });

  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("The model returned no quiz content. Try again.");
  }
  return JSON.parse(block.text) as GenQuiz;
}

// ---------------------------------------------------------------------------
// Free-text grading (short / long answers) — rubric-anchored, structured output.
// ---------------------------------------------------------------------------

export type FreeTextItem = {
  question_id: string;
  stem: string;
  marks: number;
  model_answer: string;
  rubric: { points: number; criterion: string }[];
  answer: string;
};
export type FreeTextGrade = { question_id: string; awarded: number; rationale: string };

const GRADE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    grades: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question_id: { type: "string" },
          awarded: { type: "number" },
          rationale: { type: "string" },
        },
        required: ["question_id", "awarded", "rationale"],
      },
    },
  },
  required: ["grades"],
};

const GRADE_SYSTEM = `You are a strict, fair, consistent exam grader.
For each question, award an integer number of marks from 0 to that question's max, guided ONLY by the rubric and model answer — not by writing style or length.
Award partial credit strictly per the rubric's points. If the candidate's answer is blank or irrelevant, award 0.
Echo each question_id exactly. Keep each rationale to one sentence. Output must match the JSON schema.`;

// ---------------------------------------------------------------------------
// Per-section performance analysis for the Tier-2 report — specific, varied
// feedback grounded in what the candidate actually answered.
// ---------------------------------------------------------------------------

export type SectionAnalysisInput = {
  section_no: number;
  awarded: number;
  max: number;
  questions: { type: string; stem: string; awarded: number; max: number; answer: string }[];
};
export type SectionAnalysisOut = { section_no: number; analysis: string };

const SECTION_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          section_no: { type: "integer" },
          analysis: { type: "string" },
        },
        required: ["section_no", "analysis"],
      },
    },
  },
  required: ["sections"],
};

const SECTION_ANALYSIS_SYSTEM = `You write concise, specific performance feedback for each section of an exam a candidate has taken.
For EACH section, write ONE or TWO sentences (max ~35 words) that:
- Open with a performance band word: Excellent / Good / Fair / Poor, judged from marks awarded vs available.
- Reference what actually happened — e.g. which question types (multiple-choice, true/false, short-answer, long-answer) were answered well, missed, or left blank.
- End with brief, constructive guidance when the score is weak.
Be factual and specific to the provided data; do NOT invent details. Make each section's text distinct. Echo each section_no exactly. Output must match the JSON schema.`;

export async function generateSectionAnalysis(
  sections: SectionAnalysisInput[],
): Promise<SectionAnalysisOut[]> {
  if (sections.length === 0) return [];
  const payload = sections.map((s) => ({
    section_no: s.section_no,
    marks_awarded: s.awarded,
    marks_available: s.max,
    questions: s.questions.map((q) => ({
      type: q.type,
      question: q.stem.slice(0, 300),
      marks_awarded: q.awarded,
      marks_available: q.max,
      candidate_answer: q.answer?.trim() ? q.answer.slice(0, 400) : "(no answer provided)",
    })),
  }));

  const res = await client().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    system: SECTION_ANALYSIS_SYSTEM,
    messages: [
      { role: "user", content: "Write per-section analysis:\n" + JSON.stringify(payload, null, 2) },
    ],
    ...({ output_config: { format: { type: "json_schema", schema: SECTION_ANALYSIS_SCHEMA } } } as object),
  });

  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No section analysis returned.");
  return (JSON.parse(block.text) as { sections: SectionAnalysisOut[] }).sections;
}

// ---------------------------------------------------------------------------
// Tier-3 detailed section breakdown — legacy report format: a performance-
// analysis paragraph plus explicit Strengths / Weaknesses bullets per section.
// ---------------------------------------------------------------------------

export type DetailedSectionOut = {
  section_no: number;
  performance_analysis: string;
  strengths: string[];
  weaknesses: string[];
};

const DETAILED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          section_no: { type: "integer" },
          performance_analysis: { type: "string" },
          strengths: { type: "array", items: { type: "string" } },
          weaknesses: { type: "array", items: { type: "string" } },
        },
        required: ["section_no", "performance_analysis", "strengths", "weaknesses"],
      },
    },
  },
  required: ["sections"],
};

const DETAILED_SYSTEM = `You write the per-section breakdown of a candidate's exam performance report.
For EACH section produce:
- performance_analysis: 2–3 sentences summarising how the candidate performed in that section — reference the topics covered and how accurately/completely they answered (grounded ONLY in the provided questions, answers, and marks).
- strengths: 1–3 short bullets naming specific topics/skills the candidate handled well. If nothing was handled well, give one bullet saying so plainly.
- weaknesses: 1–3 short bullets naming specific gaps (questions missed, blank answers, misunderstood topics). If there are no significant weaknesses, return exactly one bullet: "No significant weaknesses were identified."
Tone: professional assessor. Be factual — never invent topics not present in the data. Echo each section_no exactly. Output must match the JSON schema.`;

export async function generateDetailedSectionAnalysis(
  sections: SectionAnalysisInput[],
): Promise<DetailedSectionOut[]> {
  if (sections.length === 0) return [];
  const payload = sections.map((s) => ({
    section_no: s.section_no,
    marks_awarded: s.awarded,
    marks_available: s.max,
    questions: s.questions.map((q) => ({
      type: q.type,
      question: q.stem.slice(0, 300),
      marks_awarded: q.awarded,
      marks_available: q.max,
      candidate_answer: q.answer?.trim() ? q.answer.slice(0, 400) : "(no answer provided)",
    })),
  }));

  const res = await client().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    system: DETAILED_SYSTEM,
    messages: [
      {
        role: "user",
        content: "Write the detailed per-section breakdown:\n" + JSON.stringify(payload, null, 2),
      },
    ],
    ...({ output_config: { format: { type: "json_schema", schema: DETAILED_SCHEMA } } } as object),
  });

  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No detailed analysis returned.");
  return (JSON.parse(block.text) as { sections: DetailedSectionOut[] }).sections;
}

export async function gradeFreeText(items: FreeTextItem[]): Promise<FreeTextGrade[]> {
  if (items.length === 0) return [];

  const payload = items.map((it) => ({
    question_id: it.question_id,
    max_marks: it.marks,
    question: it.stem,
    model_answer: it.model_answer,
    rubric: it.rubric,
    candidate_answer: it.answer?.trim() ? it.answer : "(no answer provided)",
  }));

  const res = await client().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 8000,
    system: GRADE_SYSTEM,
    messages: [
      { role: "user", content: "Grade each answer:\n" + JSON.stringify(payload, null, 2) },
    ],
    ...({ output_config: { format: { type: "json_schema", schema: GRADE_SCHEMA } } } as object),
  });

  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("The grader returned no content.");
  return (JSON.parse(block.text) as { grades: FreeTextGrade[] }).grades;
}
