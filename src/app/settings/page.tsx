import fs from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { get, getDb } from "@/lib/db/client";
import { env } from "@/lib/env";
import { formatInt } from "@/lib/format";
import { pythonBin, workerAvailable } from "@/lib/hf/python";
import { imageUrl } from "@/lib/images/url";

export const metadata: Metadata = { title: "설정" };
export const dynamic = "force-dynamic";

function exists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function writable(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function hfWhoAmI(): Promise<{ ok: boolean; detail: string }> {
  if (!env.HF_TOKEN) return { ok: false, detail: "HF_TOKEN 미설정 (공개 데이터셋만 가능)" };
  try {
    const res = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: { authorization: `Bearer ${env.HF_TOKEN}` },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, detail: `토큰 검증 실패 (HTTP ${res.status})` };
    const json = (await res.json()) as { name?: string; fullname?: string };
    return { ok: true, detail: `인증됨: ${json.fullname ?? json.name ?? "알 수 없음"}` };
  } catch (err) {
    return { ok: false, detail: `확인 불가: ${(err as Error).message}` };
  }
}

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      {ok ? (
        <CheckCircle2 className="size-4 text-[var(--series-6)]" />
      ) : (
        <XCircle className="text-destructive size-4" />
      )}
      {children}
    </span>
  );
}

export default async function SettingsPage() {
  const db = getDb();
  const counts = get<{ sp: number; dp: number; ds: number; v: number; s: number; t: number }>(
    db,
    `SELECT (SELECT count(*) FROM superpacks) AS sp, (SELECT count(*) FROM datapacks) AS dp,
            (SELECT count(*) FROM datasets) AS ds, (SELECT count(*) FROM variants) AS v,
            (SELECT count(*) FROM samples) AS s, (SELECT count(*) FROM tags) AS t`,
  )!;
  const sampleImage = get<{ image_paths: string }>(
    db,
    `SELECT image_paths FROM samples WHERE n_images > 0 ORDER BY random() LIMIT 1`,
  );
  const probe = sampleImage ? (JSON.parse(sampleImage.image_paths) as string[])[0] : null;
  const worker = workerAvailable();
  const hf = await hfWhoAmI();
  const dbSize = exists(env.DATABASE_PATH) ? fs.statSync(env.DATABASE_PATH).size : 0;

  const rows: { label: string; value: string; ok: boolean; hint?: string }[] = [
    { label: "DATA_DIR", value: env.DATA_DIR, ok: exists(env.DATA_DIR) && writable(env.DATA_DIR) },
    {
      label: "DATABASE_PATH",
      value: `${env.DATABASE_PATH} (${(dbSize / 1e6).toFixed(1)} MB)`,
      ok: exists(env.DATABASE_PATH),
    },
    {
      label: "PATH_PREFIX_FROM → TO",
      value: env.PATH_PREFIX_FROM
        ? `${env.PATH_PREFIX_FROM} → ${env.PATH_PREFIX_TO || "(그대로)"}`
        : "(재매핑 없음)",
      ok: true,
    },
    {
      label: "IMAGE_ROOT",
      value: env.IMAGE_ROOT,
      ok: exists(env.IMAGE_ROOT),
      hint: "샘플의 image 경로 기준 폴더",
    },
    {
      label: "OUTPUT_ROOT",
      value: env.OUTPUT_ROOT,
      ok: exists(env.OUTPUT_ROOT)
        ? writable(env.OUTPUT_ROOT)
        : writable(path.dirname(env.OUTPUT_ROOT)),
      hint: "HF 변환 JSON 저장 위치 (없으면 첫 변환 때 생성)",
    },
    {
      label: "PYTHON_BIN",
      value: pythonBin(),
      ok: worker.ok,
      hint: worker.ok ? "HF 워커 사용 가능" : worker.reason,
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">설정</h2>
        <p className="text-muted-foreground text-sm">
          환경변수는 서버에서 읽습니다. 바꾸려면 <code>.env.local</code>(개발) 또는 컨테이너
          환경변수를 수정하고 재시작하세요.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>경로·실행 환경</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3">
              {rows.map((r) => (
                <div key={r.label} className="grid gap-0.5">
                  <dt className="text-muted-foreground text-xs">{r.label}</dt>
                  <dd className="grid gap-0.5">
                    <Status ok={r.ok}>
                      <code className="text-xs break-all">{r.value}</code>
                    </Status>
                    {r.hint ? (
                      <span className="text-muted-foreground text-xs">{r.hint}</span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>HuggingFace 토큰</CardTitle>
              <CardDescription>
                토큰 값은 브라우저로 내려보내지 않고 서버에서만 확인합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Status ok={hf.ok}>{hf.detail}</Status>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>이미지 열림 검증</CardTitle>
              <CardDescription>
                색인된 샘플 중 하나의 이미지를 IMAGE_ROOT 기준으로 실제로 불러옵니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {probe ? (
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- served by our own route */}
                  <img
                    src={imageUrl(probe, 256)}
                    alt=""
                    className="bg-muted size-24 rounded object-cover"
                  />
                  <code className="text-xs break-all">{probe}</code>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  이미지가 있는 색인 샘플이 아직 없습니다.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>데이터베이스</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge variant="outline">Superpack {counts.sp}</Badge>
              <Badge variant="outline">Datapack {counts.dp}</Badge>
              <Badge variant="outline">Dataset {counts.ds}</Badge>
              <Badge variant="outline">variant {counts.v}</Badge>
              <Badge variant="outline">샘플 {formatInt(counts.s)}</Badge>
              <Badge variant="outline">태그 {counts.t}</Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
