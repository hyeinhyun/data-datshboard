/**
 * Detects how to read an arbitrary JSON / JSONL data file from its first record, so a
 * user can paste paths and have them registered without writing a dataset_info entry.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { streamArray } from "stream-json/streamers/stream-array.js";

import { remapPath, unmapPath } from "@/lib/env";
import { normalizeSpec, toRawSample, type FormatSpec } from "@/lib/experiments/format";
import { deriveSample, type RawSample } from "@/lib/indexer/derive";
import { detectLayout, type FileLayout } from "@/lib/indexer/index-variant";

const MAX_FILES = 500;
const MAX_DEPTH = 3;
const DATA_FILE = /\.(json|jsonl)$/i;

/** Splits pasted input on commas and newlines; trims quotes; drops duplicates. */
export function splitPaths(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(/[,\n\r]+/)) {
    const p = raw
      .trim()
      .replace(/^['"]|['"]$/g, "")
      .trim();
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

export type Detected = { format: string; spec: FormatSpec | null };

function firstObject(v: unknown): Record<string, unknown> | null {
  return Array.isArray(v) && v.length && v[0] && typeof v[0] === "object"
    ? (v[0] as Record<string, unknown>)
    : null;
}

/**
 * Guesses the layout of one record. `spec: null` means LLaVA format (`conversations` of
 * `{from, value}` plus `image`), which the indexer reads as is.
 */
export function detectFormat(row: unknown): Detected | { error: string } {
  if (!row || typeof row !== "object" || Array.isArray(row))
    return { error: "첫 레코드가 객체가 아닙니다." };
  const r = row as Record<string, unknown>;
  const images = "images" in r ? "images" : "image" in r ? "image" : undefined;
  const withImages = (columns: Record<string, string>) =>
    images ? { ...columns, images } : columns;

  for (const key of ["conversations", "messages"]) {
    const first = firstObject(r[key]);
    if (!first) continue;
    if ("from" in first && "value" in first) {
      if (key === "conversations" && images !== "images")
        return { format: "LLaVA (conversations · from/value)", spec: null };
      return {
        format: `ShareGPT (${key} · from/value)`,
        spec: normalizeSpec({ formatting: "sharegpt", columns: withImages({ messages: key }) }),
      };
    }
    if ("role" in first && "content" in first) {
      return {
        format: `OpenAI 메시지 (${key} · role/content)`,
        spec: normalizeSpec({
          formatting: "sharegpt",
          columns: withImages({ messages: key }),
          tags: {
            role_tag: "role",
            content_tag: "content",
            user_tag: "user",
            assistant_tag: "assistant",
            system_tag: "system",
            observation_tag: "tool",
          },
        }),
      };
    }
  }

  const pairs: [string, string[]][] = [
    ["instruction", ["output", "response"]],
    ["prompt", ["response", "completion", "answer", "output"]],
    ["question", ["answer", "gt", "solution", "response"]],
    ["query", ["response", "answer"]],
  ];
  for (const [prompt, answers] of pairs) {
    const response = answers.find((a) => a in r);
    if (!(prompt in r) || !response) continue;
    const columns: Record<string, string> = { prompt, response };
    if (prompt === "instruction" && "input" in r) columns.query = "input";
    if ("system" in r) columns.system = "system";
    if ("history" in r) columns.history = "history";
    return {
      format: `Alpaca (${prompt} → ${response})`,
      spec: normalizeSpec({ formatting: "alpaca", columns: withImages(columns) }),
    };
  }
  return { error: `형식을 알 수 없습니다 (키: ${Object.keys(r).slice(0, 12).join(", ")})` };
}

async function firstRecord(file: string, layout: FileLayout): Promise<unknown> {
  if (layout === "lines") {
    const rl = readline.createInterface({
      input: fs.createReadStream(file),
      crlfDelay: Infinity,
    });
    try {
      for await (const line of rl) if (line.trim()) return JSON.parse(line.trim());
      return undefined;
    } finally {
      rl.close();
    }
  }
  return new Promise((resolve, reject) => {
    const source = fs.createReadStream(file, { highWaterMark: 1 << 16 });
    const items = streamArray.withParserAsStream();
    let settled = false;
    const finish = (err: unknown, value?: unknown) => {
      if (settled) return;
      settled = true;
      source.destroy();
      items.destroy();
      if (err) reject(err);
      else resolve(value);
    };
    items.on("data", (d: { value: unknown }) => finish(null, d.value));
    items.on("end", () => finish(null, undefined));
    items.on("error", (e: unknown) => finish(e));
    source.on("error", (e) => finish(e));
    source.pipe(items);
  });
}

export type InspectedFile = {
  /** Volume path (as stored in the DB). */
  path: string;
  status: "ok" | "missing" | "unsupported" | "error";
  error: string | null;
  size: number | null;
  layout: FileLayout | null;
  format: string | null;
  spec: FormatSpec | null;
  preview: { question: string | null; answer: string | null; nImages: number } | null;
};

/** Reads the first record of one file and works out its format. */
export async function inspectFile(volumePath: string): Promise<InspectedFile> {
  const base: InspectedFile = {
    path: volumePath,
    status: "ok",
    error: null,
    size: null,
    layout: null,
    format: null,
    spec: null,
    preview: null,
  };
  const local = remapPath(volumePath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(local);
  } catch {
    return { ...base, status: "missing", error: "파일이 없습니다." };
  }
  base.size = stat.size;
  if (!DATA_FILE.test(volumePath))
    return { ...base, status: "unsupported", error: ".json / .jsonl 파일만 가져올 수 있습니다." };
  try {
    const layout = detectLayout(local);
    const row = await firstRecord(local, layout);
    const detected = detectFormat(row);
    if ("error" in detected) return { ...base, layout, status: "error", error: detected.error };
    const d = deriveSample(detected.spec ? toRawSample(row, detected.spec) : (row as RawSample));
    return {
      ...base,
      layout,
      format: detected.format,
      spec: detected.spec,
      preview: {
        question: d.firstQuestion?.slice(0, 300) ?? null,
        answer: d.firstAnswerPreview,
        nImages: d.nImages,
      },
    };
  } catch (err) {
    return { ...base, status: "error", error: (err as Error).message };
  }
}

/**
 * Turns pasted paths into data files: a file is taken as is, a directory contributes the
 * .json/.jsonl files under it (a few levels deep, dataset_info.json excluded).
 */
export async function expandPaths(inputs: string[]): Promise<{ files: string[]; notes: string[] }> {
  const files: string[] = [];
  const notes: string[] = [];
  const add = (p: string) => {
    if (!files.includes(p)) files.push(p);
  };
  for (const input of inputs) {
    if (!path.isAbsolute(input)) {
      notes.push(`${input}: 절대 경로가 아니라서 건너뜀`);
      continue;
    }
    const volumePath = unmapPath(path.normalize(input));
    const local = remapPath(volumePath);
    let stat: fs.Stats | null = null;
    try {
      stat = fs.statSync(local);
    } catch {
      /* reported as missing by inspectFile */
    }
    if (!stat?.isDirectory()) {
      add(volumePath);
      continue;
    }
    const before = files.length;
    const queue: { dir: string; depth: number }[] = [{ dir: local, depth: 0 }];
    while (queue.length && files.length < MAX_FILES) {
      const { dir, depth } = queue.shift()!;
      let entries: fs.Dirent[] = [];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const e of entries) {
        if (e.name.startsWith(".")) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory() && depth < MAX_DEPTH) queue.push({ dir: full, depth: depth + 1 });
        else if (e.isFile() && DATA_FILE.test(e.name) && e.name !== "dataset_info.json")
          add(unmapPath(full));
      }
    }
    notes.push(`${volumePath}: 폴더에서 파일 ${files.length - before}개를 찾음`);
  }
  if (files.length >= MAX_FILES) notes.push(`파일이 많아 ${MAX_FILES}개까지만 확인했습니다.`);
  return { files: files.slice(0, MAX_FILES), notes };
}
