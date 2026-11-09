/**
 * Pure derivation of the `samples` row fields from one LLaVA-format sample.
 * No I/O here so it can be unit-tested and reused by the HF import path.
 */
export type Turn = { from: string; value: string };

export type RawSample = {
  id?: string | number;
  image?: string | string[] | null;
  conversations?: Turn[];
  meta?: Record<string, unknown>;
  [key: string]: unknown;
};

export type DerivedSample = {
  sampleId: string | null;
  imagePaths: string[];
  nImages: number;
  nTurns: number;
  hasSystem: boolean;
  firstQuestion: string | null;
  firstAnswerPreview: string | null;
  qChars: number;
  aChars: number;
  meta: Record<string, unknown> | null;
  conversations: Turn[];
  /** Text indexed by FTS: first question plus all answers (capped). */
  answerText: string;
};

export const IMAGE_TOKEN_RE = /<\|image\|>|<image>/g;
const RESERVED = new Set(["id", "image", "conversations", "meta"]);
const FTS_CAP = 20_000;
const PREVIEW_CHARS = 200;

export function normalizeRole(from: string): "system" | "human" | "gpt" | "other" {
  const f = from.toLowerCase();
  if (f === "system") return "system";
  if (f === "human" || f === "user") return "human";
  if (f === "gpt" || f === "assistant" || f === "model") return "gpt";
  return "other";
}

export function stripImageTokens(text: string): string {
  return text.replace(IMAGE_TOKEN_RE, "").replace(/^\s+|\s+$/g, "");
}

export function deriveSample(raw: RawSample): DerivedSample {
  const conversations: Turn[] = Array.isArray(raw.conversations)
    ? raw.conversations
        .filter(
          (t): t is Turn => Boolean(t) && typeof t === "object" && typeof t.value === "string",
        )
        .map((t) => ({ from: String(t.from ?? ""), value: t.value }))
    : [];
  const imagePaths = Array.isArray(raw.image)
    ? raw.image.filter((p): p is string => typeof p === "string" && p.length > 0)
    : typeof raw.image === "string" && raw.image
      ? [raw.image]
      : [];

  let firstQuestion: string | null = null;
  let firstAnswer: string | null = null;
  let qChars = 0;
  let aChars = 0;
  let nTurns = 0;
  let hasSystem = false;
  const answers: string[] = [];
  for (const t of conversations) {
    const role = normalizeRole(t.from);
    if (role === "system") hasSystem = true;
    else if (role === "human") {
      nTurns++;
      qChars += t.value.length;
      if (firstQuestion === null) firstQuestion = stripImageTokens(t.value);
    } else if (role === "gpt") {
      aChars += t.value.length;
      if (firstAnswer === null) firstAnswer = t.value;
      answers.push(t.value);
    }
  }

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) if (!RESERVED.has(k)) extra[k] = v;
  const meta: Record<string, unknown> | null =
    raw.meta && typeof raw.meta === "object"
      ? { ...(raw.meta as Record<string, unknown>), ...extra }
      : Object.keys(extra).length
        ? extra
        : null;

  const answerText = [firstQuestion ?? "", ...answers].join("\n").slice(0, FTS_CAP);
  return {
    sampleId: raw.id === undefined || raw.id === null ? null : String(raw.id),
    imagePaths,
    nImages: imagePaths.length,
    nTurns,
    hasSystem,
    firstQuestion,
    firstAnswerPreview: firstAnswer === null ? null : firstAnswer.slice(0, PREVIEW_CHARS),
    qChars,
    aChars,
    meta,
    conversations,
    answerText,
  };
}
