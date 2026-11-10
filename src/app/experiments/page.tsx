import type { Metadata } from "next";
import Link from "next/link";

import { IndexButton } from "@/components/datasets/index-button";
import { DatasetChip } from "@/components/experiments/dataset-status";
import { RootActions, RootForm } from "@/components/experiments/root-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/lib/db/client";
import { formatDate, formatInt, formatWeight, pathTail } from "@/lib/format";
import { listExperiments, listRoots, type ExperimentSummary } from "@/lib/queries/experiments";

export const metadata: Metadata = { title: "실험" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ root?: string; q?: string }> };

/** Indexed samples over the config's train datasets, and why the sum may be short. */
function trainSamples(e: ExperimentSummary): { n: number; note: string | null } {
  const train = e.datasets.filter((d) => d.split === "train");
  const n = train.reduce((s, d) => s + (d.indexStatus === "done" ? (d.nIndexed ?? 0) : 0), 0);
  const unusable = train.filter((d) => d.fileStatus !== "ok").length;
  const unindexed = train.filter((d) => d.fileStatus === "ok" && d.indexStatus !== "done").length;
  const note = unindexed
    ? `미색인 ${unindexed}개 제외`
    : unusable
      ? `읽을 수 없는 ${unusable}개 제외`
      : null;
  return { n, note };
}

export default async function ExperimentsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const db = getDb();
  const roots = listRoots(db);
  const rootId = sp.root && /^\d+$/.test(sp.root) ? Number(sp.root) : undefined;
  const q = sp.q?.trim() || undefined;
  const experiments = listExperiments(db, { rootId, q });

  // Group by root, then by directory (one directory = one experiment with its configs).
  const groups = new Map<string, { rootPath: string; dir: string; items: ExperimentSummary[] }>();
  for (const e of experiments) {
    const k = `${e.rootId}\u0000${e.dir}`;
    const g = groups.get(k) ?? { rootPath: e.rootPath, dir: e.dir, items: [] };
    g.items.push(e);
    groups.set(k, g);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">실험</h2>
        <p className="text-muted-foreground text-sm">
          루트 디렉터리 아래의 dataset_info.json과 학습 설정(YAML)을 찾아, 실험마다 어떤 데이터
          파일을 썼는지 정리합니다. 데이터 파일(JSON·JSONL)은 Dataset으로 등록되어 색인·샘플 탐색을
          할 수 있습니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>루트 디렉터리</CardTitle>
          <CardDescription>
            하위 폴더를 모두 탐색합니다(체크포인트·로그 폴더 제외). 다시 스캔하면 바뀐 설정만
            갱신되고, 내용이 같은 데이터 파일의 색인은 유지됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <RootForm />
          {roots.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>경로</TableHead>
                  <TableHead className="text-right">학습 설정</TableHead>
                  <TableHead className="text-right">dataset_info</TableHead>
                  <TableHead>스캔</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {roots.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[28rem] whitespace-normal">
                      <Link
                        href={`/experiments?root=${r.id}`}
                        className="font-mono text-xs break-all hover:underline"
                      >
                        {r.path}
                      </Link>
                      {r.error ? <p className="text-destructive text-xs">{r.error}</p> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatInt(r.nConfigs)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatInt(r.nInfos)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {r.scannedAt ? formatDate(r.scannedAt) : "대기 중"}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex flex-wrap justify-end gap-1">
                        <IndexButton scope={{ rootId: r.id }} label="데이터 모두 색인" />
                        <RootActions rootId={r.id} path={r.path} />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      {roots.length > 0 ? (
        <form className="flex flex-wrap items-center gap-2" action="/experiments">
          {rootId ? <input type="hidden" name="root" value={rootId} /> : null}
          <Input
            name="q"
            defaultValue={q}
            placeholder="설정 이름, 데이터 키, 모델·출력 경로 검색"
            className="max-w-sm"
          />
          <Button type="submit" variant="outline">
            검색
          </Button>
          {rootId || q ? (
            <Button variant="ghost" render={<Link href="/experiments" />}>
              필터 해제
            </Button>
          ) : null}
          <span className="text-muted-foreground text-sm">
            학습 설정 {formatInt(experiments.length)}개
          </span>
        </form>
      ) : null}

      {[...groups.values()].map((g) => (
        <Card key={`${g.rootPath}/${g.dir}`}>
          <CardHeader>
            <CardTitle className="font-mono text-base">{g.dir || "(루트)"}</CardTitle>
            <CardDescription className="font-mono text-xs break-all">{g.rootPath}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>설정</TableHead>
                  <TableHead>학습 데이터</TableHead>
                  <TableHead className="text-right">샘플</TableHead>
                  <TableHead>모델</TableHead>
                  <TableHead>template</TableHead>
                  <TableHead className="text-right">cutoff</TableHead>
                  <TableHead className="text-right">lr</TableHead>
                  <TableHead className="text-right">epoch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.items.map((e) => {
                  const samples = trainSamples(e);
                  const evals = e.datasets.filter((d) => d.split === "eval");
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="align-top">
                        <Link href={`/experiments/${e.id}`} className="font-medium hover:underline">
                          {e.name.split("/").pop()}
                        </Link>
                        {e.stage ? (
                          <Badge variant="secondary" className="ml-1.5">
                            {e.stage}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-[32rem] align-top whitespace-normal">
                        <div className="flex flex-wrap gap-1">
                          {e.datasets
                            .filter((d) => d.split === "train")
                            .map((d) => (
                              <DatasetChip key={`t${d.position}`} d={d} />
                            ))}
                          {evals.length ? (
                            <span className="text-muted-foreground self-center text-xs">평가:</span>
                          ) : null}
                          {evals.map((d) => (
                            <DatasetChip key={`e${d.position}`} d={d} />
                          ))}
                          {e.datasets.length === 0 ? (
                            <span className="text-muted-foreground text-xs">없음</span>
                          ) : null}
                        </div>
                        {!e.infoPath && e.datasets.length ? (
                          <p className="text-destructive mt-1 text-xs">
                            dataset_info.json을 찾지 못했습니다.
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">
                        {samples.n ? formatInt(samples.n) : "–"}
                        {samples.note ? (
                          <span className="text-muted-foreground block text-xs">
                            {samples.note}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell
                        className="max-w-[16rem] truncate align-top font-mono text-xs"
                        title={e.modelNameOrPath ?? undefined}
                      >
                        {pathTail(e.modelNameOrPath)}
                      </TableCell>
                      <TableCell className="align-top text-xs">{e.template ?? "–"}</TableCell>
                      <TableCell className="text-right align-top tabular-nums">
                        {formatInt(e.cutoffLen)}
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">
                        {e.learningRate ?? "–"}
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">
                        {formatWeight(e.numTrainEpochs)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {roots.length > 0 && experiments.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {q || rootId
            ? "조건에 맞는 학습 설정이 없습니다."
            : "아직 찾은 학습 설정이 없습니다. 스캔이 끝나면 여기에 표시됩니다."}
        </p>
      ) : null}
    </div>
  );
}
