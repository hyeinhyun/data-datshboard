import Link from "next/link";
import { Database, Download, Layers, Package, Scale, Sigma } from "lucide-react";

import { FilterBar } from "@/components/overview/filter-bar";
import { KpiCard } from "@/components/overview/kpi-card";
import { OverviewCharts } from "@/components/overview/overview-charts";
import { WeightsTable } from "@/components/overview/weights-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db/client";
import { parseOverviewFilters, type SearchParams } from "@/lib/filters";
import { getOverview, listSuperpacks } from "@/lib/queries/overview";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const db = getDb();
  const superpacks = listSuperpacks(db);
  const defaultSuperpack =
    superpacks.length > 0
      ? [...superpacks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0].id
      : null;
  const filters = parseOverviewFilters(sp, defaultSuperpack);
  const overview = getOverview(db, filters);
  const selected = superpacks.find((s) => s.id === filters.superpackId) ?? null;

  if (superpacks.length === 0 && overview.datasets.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">아직 데이터가 없습니다</h2>
        <p className="text-muted-foreground max-w-md text-sm">
          Manifest Excel(탭 = Superpack)을 가져오면 Superpack별 KPI와 분포가 여기에 표시됩니다.
        </p>
        <Button render={<Link href="/import" />}>
          <Download /> Manifest 가져오기
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          {selected ? selected.name : "전체 Dataset"}
        </h2>
        <p className="text-muted-foreground text-sm">
          {selected
            ? `Superpack · Datapack ${selected.nDatapacks}개 · Dataset ${selected.nDatasets}개`
            : "Superpack과 무관하게 등록된 모든 Dataset"}
        </p>
      </div>

      <FilterBar
        superpacks={superpacks}
        superpackId={filters.superpackId}
        options={overview.options}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Datapack" value={overview.kpis.nDatapacks} icon={Package} />
        <KpiCard label="Dataset" value={overview.kpis.nDatasets} icon={Database} />
        <KpiCard
          label="총 샘플"
          value={overview.kpis.nSamples}
          icon={Sigma}
          hint="variant 샘플 수 합계"
        />
        <KpiCard
          label="학습 샘플"
          value={overview.kpis.nTraining}
          icon={Layers}
          hint="# samples in training"
        />
        <KpiCard
          label="MX (1) 샘플"
          value={overview.kpis.nMx1}
          icon={Scale}
          hint={selected ? "MX weight (1) 적용" : "가중치 없음"}
        />
        <KpiCard
          label="MX (2) 샘플"
          value={overview.kpis.nMx2}
          icon={Scale}
          hint={selected ? "MX weight (2) 적용" : "가중치 없음"}
        />
      </div>

      <OverviewCharts overview={overview} filters={filters} />

      <Card>
        <CardHeader>
          <CardTitle>Dataset와 가중치</CardTitle>
          <CardDescription>
            {selected
              ? "이 Superpack 안에서의 variant별 샘플 수와 MX weight입니다."
              : "variant별 샘플 수입니다. Superpack을 고르면 MX weight도 표시됩니다."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WeightsTable datasets={overview.datasets} showWeights={selected !== null} />
        </CardContent>
      </Card>
    </div>
  );
}
