"use client";

import { useRouter } from "next/navigation";
import { DatabaseZap, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

import { useRealtime } from "@/components/realtime/realtime-provider";
import { Button } from "@/components/ui/button";

type IndexButtonProps = {
  scope:
    | { variantId: number }
    | { datasetId: number }
    | { datapackId: number }
    | { superpackId: number };
  status?: string;
  label?: string;
  size?: "sm" | "xs";
  variant?: "outline" | "default" | "ghost";
};

/** Queues an index job for a variant (or every variant in a dataset/datapack/superpack). */
export function IndexButton({
  scope,
  status,
  label,
  size = "sm",
  variant = "outline",
}: IndexButtonProps) {
  const router = useRouter();
  const realtime = useRealtime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active =
    status === "queued" ||
    status === "running" ||
    ("variantId" in scope &&
      Object.values(realtime.jobs).some((j) => j.status === "running" || j.status === "queued") &&
      status === "running");

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/index", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(scope),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button size={size} variant={variant} onClick={run} disabled={busy || active}>
        {busy || active ? (
          <Loader2 className="animate-spin" />
        ) : status === "done" ? (
          <RefreshCw />
        ) : (
          <DatabaseZap />
        )}
        {label ?? (active ? "색인 중" : status === "done" ? "다시 색인" : "색인")}
      </Button>
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </span>
  );
}
