"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, Play, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useRealtime } from "@/components/realtime/realtime-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatInt } from "@/lib/format";
import type { HfMapping, InspectResult } from "@/lib/hf/python";
import type { Job } from "@/lib/jobs/queue";

type HfWizardProps = { datapacks: string[]; workerReady: boolean; workerReason?: string };

const NONE = "__none__";

function sizeLabel(n: number | null): string {
  if (n === null) return "";
  if (n > 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n > 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.round(n / 1e3)} KB`;
}

export function HfWizard({ datapacks, workerReady, workerReason }: HfWizardProps) {
  const realtime = useRealtime();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [repoInput, setRepoInput] = useState("");
  const [repo, setRepo] = useState("");
  const [inspect, setInspect] = useState<InspectResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<HfMapping>({
    question: null,
    answer: null,
    image: null,
    id: null,
    system: null,
    conversations: null,
    meta: [],
    normalize_tokens: true,
  });
  const [split, setSplit] = useState("train");
  const [config, setConfig] = useState<string | null>(null);
  const [maxSamples, setMaxSamples] = useState("");
  const [imageMode, setImageMode] = useState<"first" | "all">("all");
  const [datasetName, setDatasetName] = useState("");
  const [datapackName, setDatapackName] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [language, setLanguage] = useState("en");
  const [job, setJob] = useState<Job | null>(null);

  const features = useMemo(() => Object.keys(inspect?.features ?? {}), [inspect]);
  const live = job ? realtime.jobs[job.id] : undefined;

  async function doInspect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hf/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo: repoInput }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const result = json.result as InspectResult;
      setRepo(json.repo as string);
      setInspect(result);
      setMapping((m) => ({
        ...m,
        question: result.suggested_mapping.question,
        answer: result.suggested_mapping.answer,
        image: result.suggested_mapping.image,
        id: result.suggested_mapping.id,
        meta: result.meta_candidates.slice(0, 8),
      }));
      const splits = Object.keys(result.splits);
      setSplit(splits.includes("train") ? "train" : (splits[0] ?? "train"));
      setConfig(result.configs.length === 1 ? result.configs[0] : null);
      setDatasetName(
        (json.repo as string)
          .split("/")
          .pop()!
          .replace(/[^\w.-]+/g, "_"),
      );
      setStep(2);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hf/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repo,
          config,
          split,
          mapping,
          maxSamples: maxSamples ? Number(maxSamples) : null,
          imageMode,
          datasetName,
          datapackName,
          category: category || null,
          subCategory: subCategory || null,
          language: language || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setJob(json.job as Job);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const colSelect = (
    label: string,
    value: string | null,
    onChange: (v: string | null) => void,
    hint?: string,
  ) => (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select
        items={{ [NONE]: "(없음)", ...Object.fromEntries(features.map((f) => [f, f])) }}
        value={value ?? NONE}
        onValueChange={(v) => onChange(!v || v === NONE ? null : String(v))}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>(없음)</SelectItem>
          {features.map((f) => (
            <SelectItem key={f} value={f}>
              {f} <span className="text-muted-foreground ml-1 text-xs">{inspect?.features[f]}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );

  const canProceed2 = Boolean(mapping.conversations || (mapping.question && mapping.answer));

  return (
    <div className="grid gap-4">
      <ol className="text-muted-foreground flex items-center gap-2 text-xs">
        {["링크", "필드 매핑", "옵션·실행"].map((label, i) => (
          <li
            key={label}
            className={`flex items-center gap-2 ${step === i + 1 ? "text-foreground font-medium" : ""}`}
          >
            <span
              className={`flex size-5 items-center justify-center rounded-full border text-[11px] ${step >= i + 1 ? "bg-primary text-primary-foreground border-primary" : ""}`}
            >
              {i + 1}
            </span>
            {label}
            {i < 2 ? <ArrowRight className="size-3" /> : null}
          </li>
        ))}
      </ol>

      {!workerReady ? (
        <Card>
          <CardContent className="text-destructive text-sm">
            Python 워커를 사용할 수 없습니다: {workerReason}.{" "}
            <code>cd workers &amp;&amp; uv sync</code> 후 서버를 재시작하세요.
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>HuggingFace 데이터셋 링크</CardTitle>
            <CardDescription>
              <code>org/name</code> 또는 <code>https://huggingface.co/datasets/org/name</code>.
              비공개·gated 데이터셋은 서버의 <code>HF_TOKEN</code>으로 접근합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (repoInput.trim()) void doInspect();
              }}
            >
              <Input
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="TIGER-Lab/ViRL39K"
                className="max-w-xl"
                disabled={busy || !workerReady}
                aria-label="데이터셋 저장소"
              />
              <Button type="submit" disabled={busy || !workerReady || !repoInput.trim()}>
                {busy ? <Loader2 className="animate-spin" /> : <Search />} 조회
              </Button>
            </form>
            {busy ? (
              <p className="text-muted-foreground text-xs">
                저장소 파일·스키마·미리보기 행을 가져오는 중입니다. 수십 초 걸릴 수 있습니다.
              </p>
            ) : null}
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {step === 2 && inspect ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {repo}
                  <Badge variant="secondary">이미지: {inspect.image_source}</Badge>
                  {inspect.archives.map((a) => (
                    <Badge key={a} variant="outline">
                      {a}
                    </Badge>
                  ))}
                </CardTitle>
                <CardDescription>
                  split{" "}
                  {Object.entries(inspect.splits)
                    .map(([k, v]) => `${k} (${v === null ? "?" : formatInt(v)})`)
                    .join(", ")}
                  {" · "}파일 {inspect.files.length}개{" "}
                  {inspect.files
                    .slice(0, 4)
                    .map((f) => `${f.path} ${sizeLabel(f.size)}`)
                    .join(", ")}
                  {inspect.files.length > 4 ? " …" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {features.map((f) => (
                        <TableHead key={f} className="whitespace-nowrap">
                          {f}{" "}
                          <span className="text-muted-foreground font-normal">
                            {inspect.features[f]}
                          </span>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inspect.preview.map((row, i) => (
                      <TableRow key={i}>
                        {features.map((f) => (
                          <TableCell
                            key={f}
                            className="max-w-72 truncate align-top text-xs"
                            title={String(row[f] ?? "")}
                          >
                            {typeof row[f] === "string"
                              ? (row[f] as string)
                              : JSON.stringify(row[f])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          <Card className="self-start">
            <CardHeader>
              <CardTitle>필드 매핑</CardTitle>
              <CardDescription>
                어떤 컬럼이 질문·답변·이미지인지 지정합니다. 자동 추천값이 채워져 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {colSelect(
                "conversations 컬럼 (멀티턴 배열이 있을 때)",
                mapping.conversations,
                (v) => setMapping({ ...mapping, conversations: v }),
                "지정하면 question/answer 대신 사용됩니다.",
              )}
              {!mapping.conversations ? (
                <>
                  {colSelect("question", mapping.question, (v) =>
                    setMapping({ ...mapping, question: v }),
                  )}
                  {colSelect("answer", mapping.answer, (v) =>
                    setMapping({ ...mapping, answer: v }),
                  )}
                </>
              ) : null}
              {colSelect(
                "image",
                mapping.image,
                (v) => setMapping({ ...mapping, image: v }),
                inspect.image_source === "relative_path"
                  ? "상대 경로는 저장소의 zip 아카이브에서 찾아 추출합니다."
                  : undefined,
              )}
              {colSelect(
                "id",
                mapping.id,
                (v) => setMapping({ ...mapping, id: v }),
                "없으면 행 번호를 사용합니다.",
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="hf-system">system prompt (선택)</Label>
                <Textarea
                  id="hf-system"
                  rows={2}
                  value={mapping.system ?? ""}
                  onChange={(e) => setMapping({ ...mapping, system: e.target.value || null })}
                  placeholder="Answer the question with detailed explanation…"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>meta로 보존할 컬럼</Label>
                <div className="flex flex-wrap gap-2">
                  {features
                    .filter(
                      (f) =>
                        ![
                          mapping.question,
                          mapping.answer,
                          mapping.image,
                          mapping.conversations,
                        ].includes(f),
                    )
                    .map((f) => (
                      <Label key={f} className="flex items-center gap-1.5 text-xs font-normal">
                        <Checkbox
                          checked={mapping.meta.includes(f)}
                          onCheckedChange={(v) =>
                            setMapping({
                              ...mapping,
                              meta: v ? [...mapping.meta, f] : mapping.meta.filter((m) => m !== f),
                            })
                          }
                        />
                        {f}
                      </Label>
                    ))}
                </div>
              </div>
              <Label className="flex items-center gap-2 text-sm font-normal">
                <Checkbox
                  checked={mapping.normalize_tokens}
                  onCheckedChange={(v) => setMapping({ ...mapping, normalize_tokens: v === true })}
                />
                이미지 토큰 정규화 (<code>&lt;image&gt;</code> → <code>&lt;|image|&gt;</code>)
              </Label>
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                  <ArrowLeft /> 뒤로
                </Button>
                <Button size="sm" onClick={() => setStep(3)} disabled={!canProceed2}>
                  다음 <ArrowRight />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {step === 3 && inspect ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>변환 옵션</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>split</Label>
                  <Select
                    items={Object.fromEntries(Object.keys(inspect.splits).map((s) => [s, s]))}
                    value={split}
                    onValueChange={(v) => setSplit(String(v ?? "train"))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(inspect.splits).map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {inspect.configs.length > 1 ? (
                  <div className="grid gap-1.5">
                    <Label>config</Label>
                    <Select
                      items={Object.fromEntries(inspect.configs.map((c) => [c, c]))}
                      value={config ?? inspect.configs[0]}
                      onValueChange={(v) => setConfig(String(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {inspect.configs.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div className="grid gap-1.5">
                  <Label htmlFor="hf-max">최대 샘플 수 (비우면 전체)</Label>
                  <Input
                    id="hf-max"
                    type="number"
                    min={1}
                    value={maxSamples}
                    onChange={(e) => setMaxSamples(e.target.value)}
                    placeholder="예: 1000"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>다중 이미지</Label>
                  <Select
                    items={{ all: "모두 저장", first: "첫 장만" }}
                    value={imageMode}
                    onValueChange={(v) => setImageMode(v === "first" ? "first" : "all")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">모두 저장</SelectItem>
                      <SelectItem value="first">첫 장만</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-muted-foreground text-xs">
                {inspect.archives.length
                  ? `이미지 아카이브 ${inspect.archives.join(", ")}는 첫 이미지가 필요할 때 통째로 내려받습니다 (최대 샘플 수를 줄여도 다운로드 크기는 같습니다).`
                  : "이미지는 샘플마다 개별로 저장됩니다."}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>등록 정보</CardTitle>
              <CardDescription>
                변환이 끝나면 이 이름으로 Dataset이 만들어지고 바로 색인됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="hf-name">Dataset 이름 (출력 파일명)</Label>
                <Input
                  id="hf-name"
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="hf-dp">Datapack (기존 이름을 고르거나 새로 입력)</Label>
                <Input
                  id="hf-dp"
                  list="hf-dp-list"
                  value={datapackName}
                  onChange={(e) => setDatapackName(e.target.value)}
                  placeholder="예: added"
                />
                <datalist id="hf-dp-list">
                  {datapacks.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="hf-cat">Category</Label>
                  <Input
                    id="hf-cat"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="General VQA"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="hf-sub">Sub-category</Label>
                  <Input
                    id="hf-sub"
                    value={subCategory}
                    onChange={(e) => setSubCategory(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="hf-lang">언어</Label>
                  <Input
                    id="hf-lang"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  />
                </div>
              </div>
              {error ? <p className="text-destructive text-sm">{error}</p> : null}
              {job ? (
                <div className="grid gap-2 rounded-md border p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    {live?.status === "done"
                      ? "변환 완료"
                      : live?.status === "error"
                        ? "변환 실패"
                        : "변환 작업 실행 중"}
                    <Badge variant="secondary">작업 #{job.id}</Badge>
                  </p>
                  {live && (live.status === "running" || live.status === "queued") ? (
                    <Progress value={Math.round(live.progress * 100)} className="h-1.5" />
                  ) : null}
                  <p className="text-muted-foreground text-xs">{live?.message ?? job.message}</p>
                  <p className="text-xs">
                    <Link href="/import?tab=jobs" className="underline">
                      작업 현황
                    </Link>
                    에서 진행률을 확인하고, 완료되면{" "}
                    <Link href="/datasets" className="underline">
                      Dataset
                    </Link>
                    에 등록됩니다.
                  </p>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep(2)} disabled={busy}>
                  <ArrowLeft /> 뒤로
                </Button>
                <Button
                  onClick={start}
                  disabled={busy || Boolean(job) || !datasetName.trim() || !datapackName.trim()}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Play />} 변환 시작
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
