import { EventEmitter } from "node:events";

/** Events pushed to browsers over SSE (see /api/events). */
export type RealtimeEvent =
  | {
      type: "data-changed";
      scope: "manifest" | "superpack" | "tags" | "samples" | "datasets" | "experiments";
    }
  | {
      type: "job-progress";
      jobId: number;
      status: string;
      progress: number;
      message?: string | null;
    }
  | { type: "heartbeat"; at: string };

type GlobalWithBus = typeof globalThis & { __sftDashboardBus?: EventEmitter };

function bus(): EventEmitter {
  const g = globalThis as GlobalWithBus;
  if (!g.__sftDashboardBus) {
    g.__sftDashboardBus = new EventEmitter();
    g.__sftDashboardBus.setMaxListeners(200);
  }
  return g.__sftDashboardBus;
}

export function publish(event: RealtimeEvent): void {
  bus().emit("event", event);
}

export function subscribe(listener: (event: RealtimeEvent) => void): () => void {
  bus().on("event", listener);
  return () => bus().off("event", listener);
}
