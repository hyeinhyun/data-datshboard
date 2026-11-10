"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSearch, Loader2, Upload } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes } from "@/lib/format";

type Item = {
  path: string;
  status: "ok" | "missing" | "unsupported" | "error";
  error: string | null;
  size: number | null;
  layout: "array" | "lines" | null;
  format: string | null;
  preview: { question: string | null; answer: string | null; nImages: number } | null;
  datasetId?: number;
  variantId?: number;
  jobId?: number;
};

type Response = { items: Item[]; notes: string[]; registered?: number };

const STATUS_LABEL: Record<Item["status"], string> = {
  ok: "가져올 수 있음",
  missing: "파일 없음",
  unsupported: "지원 안 함",
  error: "읽기 실패",
};

/** Paste JSON/JSONL paths (comma or newline separated), check the detected format, register. */
export function FileImport({ datapacks }: { datapacks: string[] }) {
  const router = useRouter();
  const [paths, setPaths] = useState("");
  const [datapack, setDatapack] = useState("");
  const [index, setIndex] = useState(true);
  const [preview, setPreview] = useState<Response | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<Response | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(mode: "preview" | "apply") {
    setBusy(mode);
    setError(null);
    try {
      const res = await fetch("/api/import/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          paths,
          mode,
          datapack: datapack.trim() || undefined,
          index,
          include: mode === "apply" ? [...selected] : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (mode === "preview") {
        const r = json as Response;
        setPreview(r);
        setSelected(new Set(r.items.filter((i) => i.status === "ok").map((i) => i.path)));
        setResult(null);
      } else {
        setResult(json as Response);
        setPreview(null);
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const toggle = (p: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const shown = result ?? preview;

  return (
    <Card>
      <CardHeader>
        <CardTitle>JSON / JSONL 경로로 가져오기</CardTitle>
        <CardDescription>
          파일 경로를 쉼표나 줄바꿈으로 구분해 넣으세요. 폴더를 넣으면 그 아래 .json/.jsonl을
          찾습니다. 첫 레코드를 읽어 형식(LLaVA, ShareGPT, OpenAI 메시지, Alpaca/질문-답변)을
          자동으로 판별해 Dataset으로 등록하고 색인합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Textarea
          value={paths}
          onChange={(e) => setPaths(e.target.value)}
          rows={4}
          className="font-mono text-xs"
          placeholder={
            "/group-volume/.../jsonl/datapack_gauss3_8_langablation.jsonl,\n/group-volume/.../jsonl/superpack_sft_langablation_A1_0704.jsonl"
          }
          aria-label="JSON 파일 경로"
        />
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="file-import-datapack">Datapack (선택)</Label>
            <Input
              id="file-import-datapack"
              value={datapack}
              onChange={(e) => setDatapack(e.target.value)}
              placeholder="비우면 파일이 있는 폴더"
              list="file-import-datapacks"
              className="w-72"
            />
            <datalist id="file-import-datapacks">
              {datapacks.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>
          <Label className="flex items-center gap-2 pb-2 font-normal">
            <Checkbox checked={index} onCheckedChange={(v) => setIndex(Boolean(v))} />
            등록 후 바로 색인
          </Label>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              onClick={() => send("preview")}
              disabled={busy !== null || !paths.trim()}
            >
              {busy === "preview" ? <Loader2 className="animate-spin" /> : <FileSearch />}
              찾기
            </Button>
            <Button
              onClick={() => send("apply")}
              disabled={busy !== null || !preview || selected.size === 0}
            >
              {busy === "apply" ? <Loader2 className="animate-spin" /> : <Upload />}
              {selected.size ? `${selected.size}개 등록` : "등록"}
            </Button>
          </div>
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {result ? (
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-[var(--series-2)]" />
            {result.registered}개를 등록했습니다.
            {index ? " 색인 진행 상황은 작업 탭에서 볼 수 있습니다." : ""}
          </p>
        ) : null}
        {shown?.notes.length ? (
          <ul className="text-muted-foreground list-disc pl-5 text-xs">
            {shown.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}

        {shown && shown.items.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                {preview ? <TableHead className="w-8" /> : null}
                <TableHead>파일</TableHead>
                <TableHead>형식</TableHead>
                <TableHead className="text-right">크기</TableHead>
                <TableHead>첫 샘플</TableHead>
                {result ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.items.map((i) => (
                <TableRow key={i.path} className="align-top">
                  {preview ? (
                    <TableCell>
                      <Checkbox
                        checked={selected.has(i.path)}
                        disabled={i.status !== "ok"}
                        onCheckedChange={() => toggle(i.path)}
                        aria-label={`${i.path} 선택`}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="max-w-[24rem] font-mono text-xs break-all whitespace-normal">
                    {i.path}
                  </TableCell>
                  <TableCell className="text-xs whitespace-normal">
                    {i.status === "ok" ? (
                      <>
                        <span>{i.format}</span>
                        <span className="text-muted-foreground block">
                          {i.layout === "lines" ? "JSONL" : "JSON 배열"}
                        </span>
                      </>
                    ) : (
                      <>
                        <Badge variant="destructive">{STATUS_LABEL[i.status]}</Badge>
                        <span className="text-muted-foreground mt-1 block">{i.error}</span>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatBytes(i.size)}
                  </TableCell>
                  <TableCell className="max-w-[28rem] text-xs whitespace-normal">
                    {i.preview ? (
                      <>
                        <p className="line-clamp-2">
                          <span className="text-muted-foreground">Q </span>
                          {i.preview.question ?? "–"}
                        </p>
                        <p className="line-clamp-2">
                          <span className="text-muted-foreground">GT </span>
                          {i.preview.answer ?? "–"}
                        </p>
                        <p className="text-muted-foreground">이미지 {i.preview.nImages}장</p>
                      </>
                    ) : (
                      "–"
                    )}
                  </TableCell>
                  {result ? (
                    <TableCell className="text-xs whitespace-nowrap">
                      {i.datasetId ? (
                        <span className="flex flex-col gap-1">
                          <Link href={`/datasets/${i.datasetId}`} className="underline">
                            Dataset
                          </Link>
                          <Link
                            href={`/samples?variant=${i.variantId}&view=table`}
                            className="underline"
                          >
                            샘플 표
                          </Link>
                        </span>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}
