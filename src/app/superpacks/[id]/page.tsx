import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LayoutDashboard } from "lucide-react";

import { KpiCard } from "@/components/overview/kpi-card";
import { SuperpackActions } from "@/components/superpacks/superpack-actions";
import { SuperpackComposer } from "@/components/superpacks/superpack-composer";
import { WeightEditor } from "@/components/superpacks/weight-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDb } from "@/lib/db/client";
import { formatDate } from "@/lib/format";
import { listDatapacks } from "@/lib/queries/datapacks";
import { getSuperpack } from "@/lib/queries/superpacks";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const sp = getSuperpack(getDb(), Number(id));
  return { title: sp ? `${sp.name} · Superpack` : "Superpack" };
}

export default async function SuperpackDetailPage({ params }: Props) {
  const { id } = await params;
  const db = getDb();
  const sp = getSuperpack(db, Number(id));
  if (!sp) notFound();
  const datapacks = listDatapacks(db).map((p) => ({
    id: p.id,
    name: p.name,
    nDatasets: p.nDatasets,
    nSamples: p.nSamples,
    tags: p.tags.map((t) => t.name),
    superpacks: p.superpacks.map((s) => s.name),
  }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs">
            <Link href="/superpacks" className="hover:underline">
              Superpack
            </Link>{" "}
            /
          </p>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">{sp.name}</h2>
            <Badge variant={sp.source === "user" ? "default" : "secondary"}>
              {sp.source === "user" ? "직접 구성" : "Excel"}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {sp.description ? `${sp.description} · ` : ""}갱신 {formatDate(sp.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link href={`/?sp=${sp.id}`} />}
          >
            <LayoutDashboard /> 개요에서 보기
          </Button>
          <SuperpackActions id={sp.id} name={sp.name} source={sp.source} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Datapack" value={sp.datapacks.length} />
        <KpiCard label="Dataset" value={sp.datasets.length} />
        <KpiCard label="총 샘플" value={sp.totals.nSamples} />
        <KpiCard label="MX (1) 샘플" value={sp.totals.nMx1} />
        <KpiCard label="MX (2) 샘플" value={sp.totals.nMx2} />
      </div>

      <Tabs defaultValue="weights">
        <TabsList>
          <TabsTrigger value="weights">Dataset 가중치</TabsTrigger>
          <TabsTrigger value="compose">Datapack 구성</TabsTrigger>
        </TabsList>
        <TabsContent value="weights" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>MX weight</CardTitle>
              <CardDescription>
                {sp.source === "excel"
                  ? "Excel에서 가져온 값입니다. 여기서 수정하면 다음 Excel 가져오기 때 덮어쓰일 수 있으니, 실험용이라면 복제본에서 편집하세요."
                  : "Dataset마다 MX weight (1)/(2)를 조정하면 샘플 수가 바로 재계산됩니다."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WeightEditor superpackId={sp.id} rows={sp.datasets} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="compose" className="mt-4">
          <SuperpackComposer
            datapacks={datapacks}
            mode="edit"
            superpackId={sp.id}
            initialName={sp.name}
            initialDescription={sp.description}
            initialSelected={sp.datapacks.map((p) => p.id)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
