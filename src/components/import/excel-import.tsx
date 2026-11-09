"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInt } from "@/lib/format";
import type { ImportPlan, ImportResult } from "@/lib/manifest/import";

type PreviewResponse = { fileName: string; plan: ImportPlan };
type ApplyResponse = PreviewResponse & { result: ImportResult };

export function ExcelImport() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<ApplyResponse | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function send(mode: "preview" | "apply") {
    if (!file) return;
    setBusy(mode);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("mode", mode);
      body.set("overwrite", String(overwrite));
      const res = await fetch("/api/import/excel", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (mode === "preview") {
        setPreview(json as PreviewResponse);
        setResult(null);
      } else {
        setResult(json as ApplyResponse);
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Excel Manifest 가져오기</CardTitle>
          <CardDescription>
            탭 하나가 Superpack 하나가 됩니다. 행은 Dataset으로, Datapack 컬럼은 Datapack으로
            등록됩니다. xlsx, csv, tsv를 지원합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm transition-colors ${
              dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
            }`}
          >
            <FileSpreadsheet className="text-muted-foreground size-8" />
            {file ? (
              <p>
                <span className="font-medium">{file.name}</span>{" "}
                <span className="text-muted-foreground">({Math.round(file.size / 1024)} KB)</span>
              </p>
            ) : (
              <p className="text-muted-foreground">파일을 끌어다 놓거나 클릭해서 선택하세요</p>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xlsm,.csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => send("preview")}
              disabled={!file || busy !== null}
              variant="outline"
            >
              {busy === "preview" ? <Loader2 className="animate-spin" /> : <Upload />} 미리보기
            </Button>
            <Button onClick={() => send("apply")} disabled={!preview || busy !== null}>
              {busy === "apply" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} 적용
            </Button>
            <Label className="flex items-center gap-2 text-sm">
              <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} />
              충돌하는 variant 값 덮어쓰기
            </Label>
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </CardContent>
      </Card>

      {preview ? <PlanView plan={preview.plan} /> : null}
      {result ? <ResultView result={result.result} /> : null}
    </div>
  );
}

function PlanView({ plan }: { plan: ImportPlan }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>미리보기</CardTitle>
        <CardDescription>
          시트 {plan.sheets.length}개
          {plan.totalConflicts > 0
            ? ` · 충돌 ${plan.totalConflicts}건 (덮어쓰기를 켜지 않으면 기존 값 유지)`
            : " · 충돌 없음"}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>시트 (Superpack)</TableHead>
              <TableHead className="text-right">행</TableHead>
              <TableHead>Datapack</TableHead>
              <TableHead className="text-right">신규 Dataset</TableHead>
              <TableHead className="text-right">기존 Dataset</TableHead>
              <TableHead className="text-right">충돌</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plan.sheets.map((s) => (
              <TableRow key={s.name}>
                <TableCell className="font-medium">
                  {s.name}{" "}
                  <Badge variant={s.superpackExists ? "secondary" : "default"}>
                    {s.superpackExists ? "갱신" : "신규"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatInt(s.rows)}
                  {s.skippedRows ? (
                    <span className="text-muted-foreground"> (+{s.skippedRows} 건너뜀)</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {s.datapacks.map((d) => (
                      <Badge key={d} variant={s.newDatapacks.includes(d) ? "default" : "outline"}>
                        {d}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{s.newDatasets}</TableCell>
                <TableCell className="text-right tabular-nums">{s.existingDatasets}</TableCell>
                <TableCell className="text-right tabular-nums">{s.conflicts.length}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {plan.sheets.some((s) => s.warnings.length) ? (
          <div className="rounded-md border p-3 text-xs">
            <p className="mb-1 flex items-center gap-1 font-medium">
              <AlertTriangle className="size-3.5" /> 경고
            </p>
            <ul className="text-muted-foreground list-disc space-y-0.5 pl-4">
              {plan.sheets.flatMap((s) =>
                s.warnings.map((w, i) => (
                  <li key={`${s.name}-${i}`}>
                    [{s.name}] {w}
                  </li>
                )),
              )}
            </ul>
          </div>
        ) : null}

        {plan.totalConflicts > 0 ? (
          <div className="overflow-x-auto">
            <p className="mb-2 text-sm font-medium">충돌 목록</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datapack / Dataset</TableHead>
                  <TableHead>variant</TableHead>
                  <TableHead>필드</TableHead>
                  <TableHead>기존</TableHead>
                  <TableHead>새 값</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.sheets.flatMap((s) =>
                  s.conflicts.map((c, i) => (
                    <TableRow key={`${s.name}-${i}`}>
                      <TableCell className="whitespace-nowrap">
                        {c.datapack} / {c.dataset}
                      </TableCell>
                      <TableCell>{c.kind}</TableCell>
                      <TableCell>{c.field}</TableCell>
                      <TableCell
                        className="max-w-72 truncate font-mono text-xs"
                        title={String(c.existing)}
                      >
                        {String(c.existing)}
                      </TableCell>
                      <TableCell
                        className="max-w-72 truncate font-mono text-xs"
                        title={String(c.incoming)}
                      >
                        {String(c.incoming)}
                      </TableCell>
                    </TableRow>
                  )),
                )}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ResultView({ result }: { result: ImportResult }) {
  const rows: [string, number][] = [
    ["Superpack 생성/갱신", result.superpacks],
    ["Datapack 생성", result.datapacksCreated],
    ["Dataset 생성", result.datasetsCreated],
    ["Dataset 갱신", result.datasetsUpdated],
    ["variant 반영", result.variantsUpserted],
    ["충돌 덮어씀", result.conflictsOverwritten],
    ["충돌 건너뜀", result.conflictsSkipped],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-[var(--series-6)]" /> 적용 완료
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-2 border-b py-1">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
