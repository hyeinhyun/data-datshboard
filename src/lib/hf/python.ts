import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { env } from "@/lib/env";

/** One JSON line printed by the Python worker. */
export type WorkerEvent =
  | { event: "start"; repo: string; split: string; total: number | null }
  | {
      event: "progress";
      done: number;
      total: number | null;
      images: number;
      missing_images: number;
    }
  | { event: "log"; message: string }
  | { event: "done"; n_samples: number; n_images: number; missing_images: number; out: string }
  | { event: "error"; message: string }
  | ({ event: "inspect" } & InspectResult);

export type InspectResult = {
  repo: string;
  files: { path: string; size: number | null }[];
  archives: string[];
  configs: string[];
  splits: Record<string, number | null>;
  features: Record<string, string>;
  preview: Record<string, unknown>[];
  image_source: "bytes" | "url" | "relative_path" | "none";
  suggested_mapping: {
    question: string | null;
    answer: string | null;
    image: string | null;
    id: string | null;
  };
  meta_candidates: string[];
};

export type HfMapping = {
  question: string | null;
  answer: string | null;
  image: string | null;
  id: string | null;
  system: string | null;
  conversations: string | null;
  meta: string[];
  normalize_tokens: boolean;
};

/** Parses a stdout line; returns null for non-JSON noise. */
export function parseEventLine(line: string): WorkerEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const obj = JSON.parse(trimmed) as { event?: unknown };
    return typeof obj.event === "string" ? (obj as WorkerEvent) : null;
  } catch {
    return null;
  }
}

export function pythonBin(): string {
  return path.resolve(env.PYTHON_BIN);
}

export function workerAvailable(): { ok: boolean; reason?: string } {
  const bin = pythonBin();
  if (!fs.existsSync(bin))
    return {
      ok: false,
      reason: `Python 실행 파일이 없습니다: ${bin} (workers/README.md 참고: uv sync)`,
    };
  if (!fs.existsSync(path.join(env.WORKERS_DIR, "hf_worker"))) {
    return { ok: false, reason: `워커 디렉터리가 없습니다: ${env.WORKERS_DIR}` };
  }
  return { ok: true };
}

type RunOptions = {
  onEvent?: (event: WorkerEvent) => void;
  onStderr?: (line: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/** Spawns `python -m <module> <args>` inside workers/ and streams its JSON lines. */
export function runWorker(
  module: string,
  args: string[],
  options: RunOptions = {},
): Promise<WorkerEvent[]> {
  const availability = workerAvailable();
  if (!availability.ok) return Promise.reject(new Error(availability.reason));

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin(), ["-m", module, ...args], {
      cwd: env.WORKERS_DIR,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8",
        ...(env.HF_TOKEN ? { HF_TOKEN: env.HF_TOKEN } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const events: WorkerEvent[] = [];
    const stderr: string[] = [];
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (err) reject(err);
      else resolve(events);
    };
    const onAbort = () => {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, 10_000).unref();
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(
          new Error(`워커가 ${Math.round(options.timeoutMs! / 1000)}초 안에 끝나지 않았습니다.`),
        );
      }, options.timeoutMs);
    }

    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      const event = parseEventLine(line);
      if (!event) return;
      events.push(event);
      options.onEvent?.(event);
    });
    readline.createInterface({ input: child.stderr }).on("line", (line) => {
      stderr.push(line);
      if (stderr.length > 200) stderr.shift();
      options.onStderr?.(line);
    });
    child.on("error", (err) => finish(new Error(`워커 실행 실패: ${err.message}`)));
    child.on("close", (code) => {
      const errorEvent = events.find((e) => e.event === "error") as { message: string } | undefined;
      if (options.signal?.aborted) return finish(new Error("취소됨"));
      if (code === 0) return finish();
      const tail = stderr.slice(-5).join("\n");
      finish(
        new Error(
          errorEvent?.message ?? `워커가 코드 ${code}로 종료되었습니다.${tail ? `\n${tail}` : ""}`,
        ),
      );
    });
  });
}

export async function inspectRepo(
  repo: string,
  options: { config?: string | null; split?: string | null; rows?: number } = {},
): Promise<InspectResult> {
  const args = ["--repo", repo, "--rows", String(options.rows ?? 5)];
  if (options.config) args.push("--config", options.config);
  if (options.split) args.push("--split", options.split);
  const events = await runWorker("hf_worker.hf_inspect", args, { timeoutMs: 180_000 });
  const result = events.find((e) => e.event === "inspect");
  if (!result) throw new Error("워커가 inspect 결과를 돌려주지 않았습니다.");
  return result as InspectResult;
}

export type ImportArgs = {
  repo: string;
  mappingFile: string;
  out: string;
  imageDir: string;
  imageRelPrefix: string;
  config?: string | null;
  split?: string;
  maxSamples?: number | null;
  imageMode?: "first" | "all";
  resume?: boolean;
};

export function importRepo(
  a: ImportArgs,
  options: { onEvent?: (event: WorkerEvent) => void; signal?: AbortSignal } = {},
): Promise<WorkerEvent[]> {
  const args = [
    "--repo",
    a.repo,
    "--mapping",
    a.mappingFile,
    "--out",
    a.out,
    "--image-dir",
    a.imageDir,
    "--image-rel-prefix",
    a.imageRelPrefix,
    "--split",
    a.split ?? "train",
    "--image-mode",
    a.imageMode ?? "all",
  ];
  if (a.config) args.push("--config", a.config);
  if (a.maxSamples) args.push("--max-samples", String(a.maxSamples));
  if (a.resume) args.push("--resume");
  return runWorker("hf_worker.hf_import", args, options);
}

/** `org/name` from either form, or null when it does not look like a dataset reference. */
export function normalizeRepoId(input: string): string | null {
  const text = input.trim();
  const m = /^(?:https?:\/\/huggingface\.co\/datasets\/)?([\w.-]+\/[\w.-]+)\/?(?:[?#].*)?$/.exec(
    text,
  );
  return m ? m[1] : null;
}

/** File-system safe dataset/folder name derived from the repo id. */
export function defaultDatasetName(repoId: string): string {
  return repoId
    .split("/")
    .pop()!
    .replace(/[^\w.-]+/g, "_");
}
