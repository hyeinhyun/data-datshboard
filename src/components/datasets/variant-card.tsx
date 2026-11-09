import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VARIANT_COLOR } from "@/lib/charts/palette";
import { formatDate, formatInt, formatWeight } from "@/lib/format";
import type { DatasetDetail } from "@/lib/queries/datasets";

type VariantCardProps = {
  variant: DatasetDetail["variants"][number];
  /** Optional slot for the index action (client component, Phase 4). */
  action?: React.ReactNode;
};

export function IndexStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "done":
      return (
        <Badge variant="secondary" className="gap-1">
          <CheckCircle2 className="size-3 text-[var(--series-6)]" /> 색인 완료
        </Badge>
      );
    case "running":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="size-3 animate-spin" /> 색인 중
        </Badge>
      );
    case "queued":
      return (
        <Badge variant="secondary" className="gap-1">
          <CircleDashed className="size-3" /> 대기
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="size-3" /> 오류
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <CircleDashed className="size-3" /> 미색인
        </Badge>
      );
  }
}

export function VariantCard({ variant: v, action }: VariantCardProps) {
  const mismatch = v.indexStatus === "done" && v.nSamples !== null && v.nIndexed !== v.nSamples;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ background: VARIANT_COLOR[v.kind] }}
          />
          {v.kind}
          <span className="ml-auto">
            <IndexStatusBadge status={v.indexStatus} />
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Manifest 샘플</dt>
          <dd className="tabular-nums">{formatInt(v.nSamples)}</dd>
          <dt className="text-muted-foreground">색인된 샘플</dt>
          <dd className="flex items-center gap-1 tabular-nums">
            {formatInt(v.nIndexed)}
            {mismatch ? (
              <span
                className="inline-flex items-center gap-1 text-xs text-[var(--series-2)]"
                title="Manifest 수치와 실제 색인 수가 다릅니다"
              >
                <AlertTriangle className="size-3" /> 불일치
              </span>
            ) : null}
          </dd>
          <dt className="text-muted-foreground">sft weight</dt>
          <dd className="tabular-nums">{formatWeight(v.sftWeight)}</dd>
          {v.indexedAt ? (
            <>
              <dt className="text-muted-foreground">색인 시각</dt>
              <dd>{formatDate(v.indexedAt)}</dd>
            </>
          ) : null}
        </dl>
        <p
          className="bg-muted/50 text-muted-foreground rounded px-2 py-1 font-mono text-[11px] break-all"
          title={v.jsonPath ?? ""}
        >
          {v.jsonPath ?? "(경로 없음)"}
        </p>
        {v.indexError ? <p className="text-destructive text-xs">{v.indexError}</p> : null}
        <div className="flex items-center gap-2">
          {action}
          {v.nIndexed > 0 ? (
            <Button
              nativeButton={false}
              size="sm"
              variant="outline"
              render={<Link href={`/samples?variant=${v.id}`} />}
            >
              샘플 보기
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
