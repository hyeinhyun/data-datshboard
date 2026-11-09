"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import type { RealtimeEvent } from "@/lib/realtime/bus";

type RealtimeState = {
  connected: boolean;
  lastEventAt: number | null;
  /** Latest progress per job id, for live progress bars without a refetch. */
  jobs: Record<number, { status: string; progress: number; message: string | null }>;
};

const RealtimeContext = createContext<RealtimeState>({
  connected: false,
  lastEventAt: null,
  jobs: {},
});

export function useRealtime(): RealtimeState {
  return useContext(RealtimeContext);
}

const REFRESH_DEBOUNCE_MS = 600;
const POLL_FALLBACK_MS = 30_000;

/**
 * Keeps an EventSource to /api/events open and refreshes the current server
 * component tree (debounced) whenever data changes. Falls back to polling when
 * the stream is down.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<RealtimeState>({
    connected: false,
    lastEventAt: null,
    jobs: {},
  });
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let source: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
    };

    const handle = (event: RealtimeEvent) => {
      setState((s) => {
        const next: RealtimeState = { ...s, connected: true, lastEventAt: Date.now() };
        if (event.type === "job-progress") {
          next.jobs = {
            ...s.jobs,
            [event.jobId]: {
              status: event.status,
              progress: event.progress,
              message: event.message ?? null,
            },
          };
        }
        return next;
      });
      if (event.type === "data-changed") scheduleRefresh();
      if (event.type === "job-progress" && event.status !== "running") scheduleRefresh();
    };

    const connect = () => {
      if (closed) return;
      source = new EventSource("/api/events");
      for (const type of ["data-changed", "job-progress", "heartbeat"] as const) {
        source.addEventListener(type, (e) =>
          handle(JSON.parse((e as MessageEvent).data) as RealtimeEvent),
        );
      }
      source.onopen = () => {
        setState((s) => ({ ...s, connected: true }));
        if (poll) {
          clearInterval(poll);
          poll = null;
        }
      };
      source.onerror = () => {
        setState((s) => ({ ...s, connected: false }));
        // EventSource reconnects by itself; meanwhile poll so the page stays fresh.
        if (!poll) poll = setInterval(() => router.refresh(), POLL_FALLBACK_MS);
      };
    };
    connect();

    return () => {
      closed = true;
      source?.close();
      if (poll) clearInterval(poll);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [router]);

  return <RealtimeContext.Provider value={state}>{children}</RealtimeContext.Provider>;
}
