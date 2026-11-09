"use client";

import { useEffect, useState } from "react";

import { useRealtime } from "@/components/realtime/realtime-provider";

function ago(ts: number | null, now: number): string {
  if (!ts) return "–";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return "방금";
  if (s < 60) return `${s}초 전`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}분 전`;
  return `${Math.round(m / 60)}시간 전`;
}

/** Small live indicator for the header: SSE connected or polling fallback, and last event time. */
export function ConnectionStatus() {
  const { connected, lastEventAt, jobs } = useRealtime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const running = Object.values(jobs).filter(
    (j) => j.status === "running" || j.status === "queued",
  ).length;
  return (
    <span
      className="text-muted-foreground hidden items-center gap-1.5 text-xs sm:inline-flex"
      title={connected ? "실시간 연결됨 (SSE)" : "실시간 연결 끊김 · 30초마다 새로고침"}
    >
      <span
        aria-hidden
        className={`inline-block size-2 rounded-full ${connected ? "bg-[var(--series-6)]" : "bg-[var(--series-4)]"}`}
      />
      {connected ? "실시간" : "폴링"} · 갱신 {ago(lastEventAt, now)}
      {running ? <span className="text-foreground">· 작업 {running}개 진행 중</span> : null}
    </span>
  );
}
