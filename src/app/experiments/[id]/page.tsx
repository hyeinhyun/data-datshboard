import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { stringify } from "yaml";

import { IndexButton } from "@/components/datasets/index-button";
import { datasetState } from "@/components/experiments/dataset-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/lib/db/client";
import { formatBytes, formatDate, formatInt, formatWeight } from "@/lib/format";
import { getExperiment } from "@/lib/queries/experiments";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const e = getExperiment(getDb(), Number(id));
  return { title: e ? `${e.name} · 실험` : "실험" };
}

const FILE_STATUS_LABEL: Record<string, string> = {
  ok: "있음",
  missing: "파일 없음",
  directory: "디렉터리",
  remote: "원격",
  none: "경로 없음",
  unsupported: "JSON/JSONL 아님",
};

export default async function ExperimentDetailPage({ params }: Props) {
  const { id } = await params;
  const e = getExperiment(getDb(), Number(id));
  if (!e) notFound();

  const used = new Set(e.datasets.map((d) => d.key));
  const train = e.datasets.filter((d) => d.split === "train");
  const trainIndexed = train.every((d) => d.indexStatus === "done");
  const trainSamples = train.reduce((s, d) => s + (d.nIndexed ?? 0), 0);
  const info: [string, React.ReactNode][] = [
    ["stage", e.stage],
    ["finetuning", e.finetuningType],
    ["model", e.modelNameOrPath],
    ["template", e.template],
    ["cutoff_len", e.cutoffLen === null ? null : formatInt(e.cutoffLen)],
    ["learning_rate", e.learningRate],
    ["epochs", e.numTrainEpochs === null ? null : formatWeight(e.numTrainEpochs)],
    ["output_dir", e.outputDir],
    ["media_dir", e.mediaDir],
    ["dataset_dir", e.datasetDir],
    ["dataset_info", e.infoPath],
    ["파일 수정", formatDate(e.fileMtime)],
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">
          <Link href="/experiments" className="hover:underline">
            실험
          </Link>{" "}
          /{" "}
          <Link href={`/experiments?root=${e.rootId}`} className="font-mono hover:underline">
            {e.rootPath}
          </Link>
        </p>
        <h2 className="font-mono text-2xl font-semibold tracking-tight">{e.name}</h2>
        <p className="text-muted-foreground font-mono text-xs break-all">{e.configPath}</p>
        {e.siblings.length ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">같은 폴더의 설정:</span>
            {e.siblings.map((s) => (
              <Badge key={s.id} variant="outline" render={<Link href={`/experiments/${s.id}`} />}>
                {s.name.split("/").pop()}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>사용한 데이터</CardTitle>
            <CardDescription>
              설정의 <code>dataset</code>·<code>eval_dataset</code>을 dataset_info.json에서 찾은
              결과입니다. 학습 데이터 샘플{" "}
              <span className="text-foreground font-medium tabular-nums">
                {formatInt(trainSamples)}
              </span>
              개{trainIndexed ? "" : " (색인된 파일만)"}
            </CardDescription>
          </div>
          {e.datasets.some((d) => d.variantId) ? (
            <IndexButton scope={{ experimentId: e.id }} label="모두 색인" />
          ) : null}
        </CardHeader>
        <CardContent>
          {e.datasets.length === 0 ? (
            <p className="text-muted-foreground text-sm">설정에 dataset이 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>용도</TableHead>
                  <TableHead>키</TableHead>
                  <TableHead>파일</TableHead>
                  <TableHead>형식</TableHead>
                  <TableHead className="text-right">크기</TableHead>
                  <TableHead className="text-right">샘플</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {e.datasets.map((d) => {
                  const state = datasetState(d);
                  return (
                    <TableRow key={`${d.split}-${d.position}`}>
                      <TableCell>{d.split === "train" ? "학습" : "평가"}</TableCell>
                      <TableCell className="font-medium">
                        {d.datasetId ? (
                          <Link href={`/datasets/${d.datasetId}`} className="hover:underline">
                            {d.key}
                          </Link>
                        ) : (
                          d.key
                        )}
                      </TableCell>
                      <TableCell className="max-w-[28rem] font-mono text-xs break-all whitespace-normal">
                        {d.resolvedPath ?? d.fileName ?? "–"}
                        {d.indexError ? (
                          <p className="text-destructive font-sans">{d.indexError}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs">
                        {d.formatting ?? "–"}
                        {d.ranking ? " · ranking" : ""}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {formatBytes(d.fileSize)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${state.tone === "error" ? "text-destructive" : ""}`}
                      >
                        {state.label}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex gap-1">
                          {d.variantId ? (
                            <IndexButton
                              scope={{ variantId: d.variantId }}
                              status={d.indexStatus ?? undefined}
                              size="xs"
                            />
                          ) : null}
                          {d.variantId && d.indexStatus === "done" ? (
                            <Button
                              size="xs"
                              variant="ghost"
                              render={<Link href={`/samples?variant=${d.variantId}`} />}
                            >
                              샘플 보기
                            </Button>
                          ) : null}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>주요 설정</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {info.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-mono text-xs break-all">{v ?? "–"}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>dataset_info.json 항목</CardTitle>
            <CardDescription>
              이 설정이 읽는 레지스트리의 전체 항목. 굵은 항목이 이 설정에서 쓰는 것입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {e.registry.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {e.infoPath ? "항목이 없습니다." : "dataset_info.json을 찾지 못했습니다."}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {e.registry.map((r) => (
                  <li key={r.key} className="flex flex-col">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {r.datasetId ? (
                        <Link
                          href={`/datasets/${r.datasetId}`}
                          className={`hover:underline ${used.has(r.key) ? "font-semibold" : ""}`}
                        >
                          {r.key}
                        </Link>
                      ) : (
                        <span className={used.has(r.key) ? "font-semibold" : ""}>{r.key}</span>
                      )}
                      <Badge
                        variant={r.fileStatus === "ok" ? "outline" : "destructive"}
                        className="h-4 text-[10px]"
                      >
                        {FILE_STATUS_LABEL[r.fileStatus]}
                      </Badge>
                      {r.ranking ? (
                        <Badge variant="secondary" className="h-4 text-[10px]">
                          ranking
                        </Badge>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground font-mono text-xs break-all">
                      {r.fileName ?? "–"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>전체 설정</CardTitle>
          <CardDescription>YAML을 파싱한 값입니다(주석 제외).</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted max-h-[32rem] overflow-auto rounded-md p-3 font-mono text-xs">
            {stringify(e.config)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
