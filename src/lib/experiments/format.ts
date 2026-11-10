/**
 * LLaMA-Factory `dataset_info.json` entries and conversion of a data-file row into the
 * LLaVA-style sample the indexer understands. Pure: no I/O, safe to unit-test.
 *
 * Defaults follow LLaMA-Factory's `DatasetAttr` (data/parser.py).
 */
import type { RawSample, Turn } from "@/lib/indexer/derive";

export type Formatting = "alpaca" | "sharegpt";

export type FormatSpec = {
  formatting: Formatting;
  ranking: boolean;
  columns: Record<string, string>;
  tags: Record<string, string>;
};

export type DatasetInfoEntry = {
  key: string;
  /** `file_name` as written (may be relative to the registry's directory). */
  fileName: string | null;
  /** Remote sources (hf_hub_url, ms_hub_url, om_hub_url, script_url) when there is no file. */
  remote: string | null;
  spec: FormatSpec;
};

const SHAREGPT_COLUMNS: Record<string, string> = { messages: "conversations" };
const ALPACA_COLUMNS: Record<string, string> = {
  prompt: "instruction",
  query: "input",
  response: "output",
};
const SHAREGPT_TAGS: Record<string, string> = {
  role_tag: "from",
  content_tag: "value",
  user_tag: "human",
  assistant_tag: "gpt",
  observation_tag: "observation",
  function_tag: "function_call",
  system_tag: "system",
};

function strings(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === "object" && !Array.isArray(v))
    for (const [k, val] of Object.entries(v)) if (typeof val === "string") out[k] = val;
  return out;
}

export function normalizeSpec(raw: Record<string, unknown>): FormatSpec {
  const formatting: Formatting = raw.formatting === "sharegpt" ? "sharegpt" : "alpaca";
  const defaults = formatting === "sharegpt" ? SHAREGPT_COLUMNS : ALPACA_COLUMNS;
  return {
    formatting,
    ranking: raw.ranking === true,
    columns: { ...defaults, ...strings(raw.columns) },
    tags: formatting === "sharegpt" ? { ...SHAREGPT_TAGS, ...strings(raw.tags) } : {},
  };
}

/** Parses the registry object. Entries that are not objects are skipped. */
export function parseDatasetInfo(json: unknown): DatasetInfoEntry[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("dataset_info.json은 { 이름: 설정 } 형태의 객체여야 합니다.");
  }
  const entries: DatasetInfoEntry[] = [];
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const v = value as Record<string, unknown>;
    const remote =
      ["hf_hub_url", "ms_hub_url", "om_hub_url", "script_url", "cloud_file_name"]
        .map((k) => v[k])
        .find((x): x is string => typeof x === "string" && x.length > 0) ?? null;
    entries.push({
      key,
      fileName: typeof v.file_name === "string" && v.file_name ? v.file_name : null,
      remote,
      spec: normalizeSpec(v),
    });
  }
  return entries;
}

/** True for template placeholders such as `{jsonl file that you made ...}`. */
export function isPlaceholder(fileName: string): boolean {
  return /^\{.*\}$/.test(fileName.trim());
}

/** Splits LLaMA-Factory's comma-separated `dataset` / `eval_dataset` value. */
export function splitDatasetList(v: unknown): string[] {
  const items = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(",") : [];
  return items.map((s) => s.trim()).filter(Boolean);
}

function asImages(v: unknown): string[] | undefined {
  if (typeof v === "string" && v) return [v];
  if (Array.isArray(v)) {
    const paths = v
      .map((x) =>
        typeof x === "string"
          ? x
          : x && typeof x === "object" && typeof (x as { path?: unknown }).path === "string"
            ? (x as { path: string }).path
            : null,
      )
      .filter((x): x is string => Boolean(x));
    return paths;
  }
  return undefined;
}

function text(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

function sharegptRole(role: string, tags: Record<string, string>): string {
  if (role === tags.user_tag) return "human";
  if (role === tags.assistant_tag) return "gpt";
  if (role === tags.system_tag) return "system";
  if (role === tags.observation_tag) return "observation";
  if (role === tags.function_tag) return "function_call";
  return role;
}

function sharegptTurn(m: unknown, tags: Record<string, string>): Turn | null {
  if (!m || typeof m !== "object") return null;
  const o = m as Record<string, unknown>;
  const role = o[tags.role_tag];
  if (typeof role !== "string") return null;
  return { from: sharegptRole(role, tags), value: text(o[tags.content_tag]) };
}

/**
 * Converts one row of a registered data file into a LLaVA-style sample. Columns that are
 * not part of the conversation (ids, chosen/rejected, custom metadata) are kept so they
 * end up in the sample's meta.
 */
export function toRawSample(row: unknown, spec: FormatSpec): RawSample {
  if (!row || typeof row !== "object" || Array.isArray(row)) return { conversations: [] };
  const r = row as Record<string, unknown>;
  const c = spec.columns;
  const used = new Set<string>();
  const extra: Record<string, unknown> = {};
  const take = (col: string | undefined) => {
    if (!col) return undefined;
    used.add(col);
    return r[col];
  };

  const conversations: Turn[] = [];
  const system = take(c.system);
  if (typeof system === "string" && system) conversations.push({ from: "system", value: system });

  if (spec.formatting === "sharegpt") {
    const messages = take(c.messages);
    if (Array.isArray(messages))
      for (const m of messages) {
        const t = sharegptTurn(m, spec.tags);
        if (t) conversations.push(t);
      }
    if (spec.ranking) {
      for (const k of ["chosen", "rejected"] as const) {
        const v = take(c[k]);
        const t = sharegptTurn(v, spec.tags);
        if (v !== undefined) extra[k] = t ? t.value : v;
      }
    }
  } else {
    const history = take(c.history);
    if (Array.isArray(history))
      for (const pair of history)
        if (Array.isArray(pair) && pair.length >= 2) {
          conversations.push({ from: "human", value: text(pair[0]) });
          conversations.push({ from: "gpt", value: text(pair[1]) });
        }
    const prompt = [text(take(c.prompt)), text(take(c.query))].filter(Boolean).join("\n");
    conversations.push({ from: "human", value: prompt });
    if (spec.ranking) {
      for (const k of ["chosen", "rejected"] as const) {
        const v = take(c[k]);
        if (v !== undefined) extra[k] = text(v);
      }
    } else {
      const response = take(c.response);
      const answer = Array.isArray(response) ? text(response[0]) : text(response);
      if (answer) conversations.push({ from: "gpt", value: answer });
    }
  }

  // Without an images column LLaMA-Factory ignores images, but a LLaVA-style `image`
  // field is still worth showing in the explorer.
  const image = asImages(c.images ? take(c.images) : take("image"));
  const sample: RawSample = { conversations };
  if (image) sample.image = image;
  for (const [k, v] of Object.entries(r)) {
    if (used.has(k)) continue;
    // Keys the indexer reserves for itself are kept under a prefixed name.
    sample[k === "conversations" || k === "image" ? `raw_${k}` : k] = v;
  }
  return Object.assign(sample, extra);
}
