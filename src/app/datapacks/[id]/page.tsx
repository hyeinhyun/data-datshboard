import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { WeightsTable } from "@/components/overview/weights-table";
import { TagEditor } from "@/components/tags/tag-editor";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db/client";
import { formatInt } from "@/lib/format";
import { getDatapack } from "@/lib/queries/datapacks";
import { listTags } from "@/lib/queries/tags";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const dp = getDatapack(getDb(), Number(id));
  return { title: dp ? `${dp.name} · Datapack` : "Datapack" };
}

export default async function DatapackDetailPage({ params }: Props) {
  const { id } = await params;
  const db = getDb();
  const dp = getDatapack(db, Number(id));
  if (!dp) notFound();
  const suggestions = listTags(db).map((t) => t.name);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs">
          <Link href="/datapacks" className="hover:underline">
            Datapack
          </Link>{" "}
          /
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">{dp.name}</h2>
        <p className="text-muted-foreground text-sm">
          Dataset {formatInt(dp.nDatasets)}개 · 샘플 {formatInt(dp.nSamples)}
          {dp.description ? ` · ${dp.description}` : ""}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>소속 Superpack</CardTitle>
            <CardDescription>이 Datapack을 포함하는 학습 믹스</CardDescription>
          </CardHeader>
          <CardContent>
            {dp.superpacks.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                아직 어떤 Superpack에도 포함되지 않았습니다.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {dp.superpacks.map((s) => (
                  <Badge
                    key={s.id}
                    variant={s.source === "user" ? "default" : "secondary"}
                    render={<Link href={`/superpacks/${s.id}`} />}
                  >
                    {s.name}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>태그</CardTitle>
            <CardDescription>이 Datapack의 모든 Dataset에 상속됩니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <TagEditor
              targetType="datapack"
              targetId={dp.id}
              tags={dp.tags}
              suggestions={suggestions}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>포함된 Dataset</CardTitle>
          <CardDescription>variant별 Manifest 샘플 수</CardDescription>
        </CardHeader>
        <CardContent>
          <WeightsTable datasets={dp.datasets} showWeights={false} />
        </CardContent>
      </Card>
    </div>
  );
}
