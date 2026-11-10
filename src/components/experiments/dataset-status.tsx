import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatBytes, formatInt } from "@/lib/format";
import type { ExperimentDataset } from "@/lib/queries/experiments";

/** Short state of a config's dataset key: problem with the file, or its indexed sample count. */
export function datasetState(d: ExperimentDataset): {
  label: string;
  tone: "error" | "warn" | "muted" | "ok";
} {
  if (d.fileStatus === null) return { label: "등록 안 된 키", tone: "error" };
  if (d.fileStatus === "missing") return { label: "파일 없음", tone: "error" };
  if (d.fileStatus === "directory") return { label: "디렉터리", tone: "warn" };
  if (d.fileStatus === "remote") return { label: "원격", tone: "muted" };
  if (d.fileStatus === "none") return { label: "경로 없음", tone: "warn" };
  if (d.fileStatus === "unsupported") return { label: "JSON/JSONL 아님", tone: "warn" };
  if (d.indexStatus === "done") return { label: `${formatInt(d.nIndexed)}개`, tone: "ok" };
  if (d.indexStatus === "running" || d.indexStatus === "queued")
    return { label: "색인 중", tone: "muted" };
  if (d.indexStatus === "error") return { label: "색인 오류", tone: "error" };
  return { label: `미색인 · ${formatBytes(d.fileSize)}`, tone: "muted" };
}

const TONE_CLASS = {
  error: "border-destructive/40 text-destructive",
  warn: "border-[var(--series-4)] text-foreground",
  muted: "text-muted-foreground",
  ok: "text-foreground",
} as const;

/** One dataset key of a config as a compact chip linking to its dataset page. */
export function DatasetChip({ d }: { d: ExperimentDataset }) {
  const state = datasetState(d);
  const body = (
    <>
      <span className="font-medium">{d.key}</span>
      <span className={state.tone === "ok" ? "tabular-nums opacity-70" : ""}>{state.label}</span>
    </>
  );
  const className = `h-auto gap-1.5 py-0.5 ${TONE_CLASS[state.tone]}`;
  return d.datasetId ? (
    <Badge
      variant="outline"
      className={className}
      render={<Link href={`/datasets/${d.datasetId}`} title={d.resolvedPath ?? undefined} />}
    >
      {body}
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className={className}
      title={d.resolvedPath ?? d.fileName ?? undefined}
    >
      {body}
    </Badge>
  );
}
