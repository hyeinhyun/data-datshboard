import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { VariantCard } from "@/components/datasets/variant-card";
import { TagEditor } from "@/components/tags/tag-editor";
import { Badge } from "@/components/ui/badge";
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
import { formatDate, formatInt, formatWeight } from "@/lib/format";
import { getDataset } from "@/lib/queries/datasets";
import { listTags } from "@/lib/queries/tags";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const d = getDataset(getDb(), Number(id));
  return { title: d ? `${d.name} · Dataset` : "Dataset" };
}

export default async function DatasetDetailPage({ params }: Props) {
  const { id } = await params;
  const db = getDb();
  const d = getDataset(db, Number(id));
  if (!d) notFound();
  const suggestions = listTags(db).map((t) => t.name);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">
          <Link href="/datasets" className="hover:underline">
            Dataset
          </Link>{" "}
          /{" "}
          <Link href={`/datapacks/${d.datapackId}`} className="hover:underline">
            {d.datapack}
          </Link>{" "}
          /
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">{d.name}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" render={<Link href={`/datapacks/${d.datapackId}`} />}>
            {d.datapack}
          </Badge>
          {d.category ? <Badge variant="outline">{d.category}</Badge> : null}
          {d.subCategory ? <Badge variant="outline">{d.subCategory}</Badge> : null}
          {d.language ? <Badge variant="outline">{d.language}</Badge> : null}
          <Badge variant="outline">
            {d.source === "hf" ? "HuggingFace" : d.source === "user" ? "직접 등록" : "Excel"}
          </Badge>
          {d.hfRepo ? (
            <a
              className="text-xs underline"
              href={`https://huggingface.co/datasets/${d.hfRepo}`}
              target="_blank"
              rel="noreferrer"
            >
              {d.hfRepo}
            </a>
          ) : null}
        </div>
        {d.note ? <p className="text-sm">{d.note}</p> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {d.variants.map((v) => (
          <VariantCard key={v.id} variant={v} />
        ))}
        {d.variants.length === 0 ? (
          <p className="text-muted-foreground text-sm md:col-span-3">variant가 없습니다.</p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Superpack별 가중치</CardTitle>
            <CardDescription>이 Dataset이 포함된 Superpack과 그 안에서의 MX weight</CardDescription>
          </CardHeader>
          <CardContent>
            {d.superpacks.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                어떤 Superpack에도 포함되지 않았습니다.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Superpack</TableHead>
                    <TableHead className="text-right">MX (1)</TableHead>
                    <TableHead className="text-right">MX (2)</TableHead>
                    <TableHead className="text-right">학습 샘플</TableHead>
                    <TableHead className="text-right">MX(1) 샘플</TableHead>
                    <TableHead className="text-right">MX(2) 샘플</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.superpacks.map((s) => (
                    <TableRow key={s.superpackId}>
                      <TableCell>
                        <Link href={`/superpacks/${s.superpackId}`} className="hover:underline">
                          {s.superpack}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatWeight(s.mxWeight1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatWeight(s.mxWeight2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(s.nTraining)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatInt(s.nMx1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatInt(s.nMx2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>태그</CardTitle>
              <CardDescription>회색 태그는 Datapack에서 상속된 것입니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <TagEditor
                targetType="dataset"
                targetId={d.id}
                tags={d.tags}
                inherited={d.datapackTags}
                suggestions={suggestions}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>정보</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">원본 JSON</dt>
                <dd className="font-mono text-xs break-all">{d.originJson ?? "–"}</dd>
                <dt className="text-muted-foreground">등록</dt>
                <dd>{formatDate(d.createdAt)}</dd>
                <dt className="text-muted-foreground">갱신</dt>
                <dd>{formatDate(d.updatedAt)}</dd>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
