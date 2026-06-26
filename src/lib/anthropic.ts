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

  const userMsg =
    `Create a ${input.difficulty} quiz on the topic: "${input.topic}".\n` +
    `Produce exactly ${input.sections} section(s). In EACH section include exactly ` +
    `${input.mcqPerSection} mcq, ${input.shortPerSection} short, and ${input.longPerSection} long question(s).` +
    kb;

  const res = await client().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content: userMsg }],
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
