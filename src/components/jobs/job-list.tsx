"use client";

import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";

import { useRealtime } from "@/components/realtime/realtime-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { Job } from "@/lib/jobs/queue";

const TYPE_LABEL: Record<Job["type"], string> = {
  index: "샘플 색인",
  hf_inspect: "HF 조회",
  hf_import: "HF 변환",
  excel_import: "Excel 가져오기",
  scan: "실험 스캔",
};

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "done":
      return (
        <Badge variant="secondary" className="gap-1">
          <CheckCircle2 className="size-3 text-[var(--series-6)]" /> 완료
        </Badge>
      );
    case "running":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="size-3 animate-spin" /> 실행 중
        </Badge>
      );
    case "queued":
      return (
        <Badge variant="outline" className="gap-1">
          <CircleDashed className="size-3" /> 대기
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="outline" className="gap-1">
          <Ban className="size-3" /> 취소
        </Badge>
      );
    default:
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="size-3" /> 오류
        </Badge>
      );
  }
}

export function JobList({ jobs }: { jobs: Job[] }) {
  const router = useRouter();
  const realtime = useRealtime();

  async function cancel(id: number) {
    await fetch(`/api/jobs/${id}/cancel`, { method: "POST" });
    router.refresh();
  }

  if (jobs.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">아직 작업이 없습니다.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">#</TableHead>
          <TableHead>유형</TableHead>
          <TableHead>상태</TableHead>
          <TableHead className="w-[40%]">진행</TableHead>
          <TableHead>시작</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => {
          const live = realtime.jobs[job.id];
          const status = live?.status ?? job.status;
          const progress = live?.progress ?? job.progress;
          const message = live?.message ?? job.message;
          return (
            <TableRow key={job.id}>
              <TableCell className="text-muted-foreground tabular-nums">{job.id}</TableCell>
              <TableCell className="whitespace-nowrap">
                {TYPE_LABEL[job.type] ?? job.type}
              </TableCell>
              <TableCell>
                <StatusBadge status={status} />
              </TableCell>
              <TableCell>
                <div className="grid gap-1">
                  {status === "running" || status === "queued" ? (
                    <Progress value={Math.round(progress * 100)} className="h-1.5" />
                  ) : null}
                  <p className="text-muted-foreground truncate text-xs" title={message ?? ""}>
                    {message ?? "–"}
                  </p>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                {formatDate(job.startedAt ?? job.createdAt)}
              </TableCell>
              <TableCell className="text-right">
                {status === "running" || status === "queued" ? (
                  <Button size="xs" variant="ghost" onClick={() => cancel(job.id)}>
                    취소
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
