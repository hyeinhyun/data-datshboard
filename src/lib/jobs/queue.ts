import type { DatabaseSync } from "node:sqlite";

import { all, get, getDb } from "@/lib/db/client";
import { publish } from "@/lib/realtime/bus";

export type JobType = "index" | "hf_inspect" | "hf_import" | "excel_import" | "scan";
export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";

export type Job = {
  id: number;
  type: JobType;
  status: JobStatus;
  progress: number;
  message: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type JobContext = {
  job: Job;
  signal: AbortSignal;
  /** Throttled: writes progress/message to the row and pushes an SSE event. */
  progress: (fraction: number, message?: string) => void;
};

export type JobHandler = (
  ctx: JobContext,
  db: DatabaseSync,
) => Promise<Record<string, unknown> | void>;

type Runner = {
  handlers: Map<JobType, JobHandler>;
  running: Map<number, AbortController>;
  pumping: boolean;
  concurrency: number;
};

type GlobalWithRunner = typeof globalThis & { __sftDashboardJobs?: Runner };

function runner(): Runner {
  const g = globalThis as GlobalWithRunner;
  if (!g.__sftDashboardJobs) {
    g.__sftDashboardJobs = {
      handlers: new Map(),
      running: new Map(),
      pumping: false,
      concurrency: 1,
    };
    // Jobs left "running" by a previous process cannot be resumed.
    getDb()
      .prepare(
        `UPDATE jobs SET status = 'error', message = '서버가 재시작되어 중단되었습니다.', finished_at = datetime('now')
         WHERE status = 'running'`,
      )
      .run();
  }
  return g.__sftDashboardJobs;
}

export function registerHandler(type: JobType, handler: JobHandler): void {
  runner().handlers.set(type, handler);
}

type RawJob = Omit<Job, "payload" | "result"> & { payload: string | null; result: string | null };

function hydrate(r: RawJob): Job {
  return {
    ...r,
    payload: r.payload ? (JSON.parse(r.payload) as Record<string, unknown>) : {},
    result: r.result ? (JSON.parse(r.result) as Record<string, unknown>) : null,
  };
}

const SELECT = `SELECT id, type, status, progress, message, payload, result, created_at AS createdAt,
  started_at AS startedAt, finished_at AS finishedAt FROM jobs`;

export function listJobs(db: DatabaseSync, limit = 50): Job[] {
  return all<RawJob>(db, `${SELECT} ORDER BY id DESC LIMIT ?`, limit).map(hydrate);
}

export function getJob(db: DatabaseSync, id: number): Job | null {
  const r = get<RawJob>(db, `${SELECT} WHERE id = ?`, id);
  return r ? hydrate(r) : null;
}

/** Jobs that are queued or running for the given payload key/value (e.g. variantId). */
export function activeJobFor(
  db: DatabaseSync,
  type: JobType,
  key: string,
  value: number,
): Job | null {
  const r = get<RawJob>(
    db,
    `${SELECT} WHERE type = ? AND status IN ('queued', 'running') AND json_extract(payload, ?) = ?
     ORDER BY id DESC LIMIT 1`,
    type,
    `$.${key}`,
    value,
  );
  return r ? hydrate(r) : null;
}

export function enqueue(type: JobType, payload: Record<string, unknown>, message?: string): Job {
  const db = getDb();
  const row = get<{ id: number }>(
    db,
    `INSERT INTO jobs (type, payload, message) VALUES (?, ?, ?) RETURNING id`,
    type,
    JSON.stringify(payload),
    message ?? null,
  )!;
  const job = getJob(db, row.id)!;
  publish({
    type: "job-progress",
    jobId: job.id,
    status: job.status,
    progress: 0,
    message: job.message,
  });
  void pump();
  return job;
}

export function cancelJob(id: number): boolean {
  const db = getDb();
  const job = getJob(db, id);
  if (!job) return false;
  if (job.status === "queued") {
    db.prepare(
      `UPDATE jobs SET status = 'cancelled', finished_at = datetime('now'), message = '취소됨' WHERE id = ?`,
    ).run(id);
    publish({
      type: "job-progress",
      jobId: id,
      status: "cancelled",
      progress: job.progress,
      message: "취소됨",
    });
    return true;
  }
  const controller = runner().running.get(id);
  if (controller) {
    controller.abort();
    return true;
  }
  return false;
}

async function pump(): Promise<void> {
  const r = runner();
  if (r.pumping) return;
  r.pumping = true;
  try {
    while (r.running.size < r.concurrency) {
      const db = getDb();
      const next = get<RawJob>(db, `${SELECT} WHERE status = 'queued' ORDER BY id LIMIT 1`);
      if (!next) break;
      const job = hydrate(next);
      const handler = r.handlers.get(job.type);
      if (!handler) {
        db.prepare(
          `UPDATE jobs SET status = 'error', message = ?, finished_at = datetime('now') WHERE id = ?`,
        ).run(`처리기가 없는 작업 유형: ${job.type}`, job.id);
        continue;
      }
      const controller = new AbortController();
      r.running.set(job.id, controller);
      db.prepare(
        `UPDATE jobs SET status = 'running', started_at = datetime('now') WHERE id = ?`,
      ).run(job.id);
      publish({
        type: "job-progress",
        jobId: job.id,
        status: "running",
        progress: 0,
        message: job.message,
      });
      // Run without awaiting so the loop can schedule up to `concurrency` jobs.
      void execute(job, handler, controller).finally(() => {
        r.running.delete(job.id);
        void pump();
      });
    }
  } finally {
    r.pumping = false;
  }
}

async function execute(job: Job, handler: JobHandler, controller: AbortController): Promise<void> {
  const db = getDb();
  let lastWrite = 0;
  const progress = (fraction: number, message?: string) => {
    const now = Date.now();
    const pct = Math.max(0, Math.min(1, fraction));
    if (now - lastWrite < 400 && pct < 1) return;
    lastWrite = now;
    db.prepare(`UPDATE jobs SET progress = ?, message = COALESCE(?, message) WHERE id = ?`).run(
      pct,
      message ?? null,
      job.id,
    );
    publish({
      type: "job-progress",
      jobId: job.id,
      status: "running",
      progress: pct,
      message: message ?? null,
    });
  };
  try {
    const result = await handler({ job, signal: controller.signal, progress }, db);
    const cancelled = controller.signal.aborted;
    db.prepare(
      `UPDATE jobs SET status = ?, progress = ?, result = ?, message = COALESCE(?, message), finished_at = datetime('now') WHERE id = ?`,
    ).run(
      cancelled ? "cancelled" : "done",
      cancelled ? job.progress : 1,
      result ? JSON.stringify(result) : null,
      cancelled ? "취소됨" : null,
      job.id,
    );
    publish({
      type: "job-progress",
      jobId: job.id,
      status: cancelled ? "cancelled" : "done",
      progress: 1,
      message: null,
    });
  } catch (err) {
    const cancelled = controller.signal.aborted;
    const message = cancelled ? "취소됨" : (err as Error).message;
    db.prepare(
      `UPDATE jobs SET status = ?, message = ?, finished_at = datetime('now') WHERE id = ?`,
    ).run(cancelled ? "cancelled" : "error", message, job.id);
    publish({
      type: "job-progress",
      jobId: job.id,
      status: cancelled ? "cancelled" : "error",
      progress: 0,
      message,
    });
  }
  publish({ type: "data-changed", scope: "samples" });
}
