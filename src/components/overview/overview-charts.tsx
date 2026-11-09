"use client";

import { useRouter } from "next/navigation";

import { ShareBars } from "@/components/charts/share-bars";
import { StackedBarChart } from "@/components/charts/stacked-bar-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SERIES, VARIANT_COLOR, VARIANT_ORDER } from "@/lib/charts/palette";
import { FILTER_KEYS, filtersToQuery } from "@/lib/filters";
import { VARIANT_LABELS } from "@/lib/manifest/types";
import type { Overview, OverviewFilters } from "@/lib/queries/overview";

type OverviewChartsProps = {
  overview: Overview;
  filters: OverviewFilters;
};

export function OverviewCharts({ overview, filters }: OverviewChartsProps) {
  const router = useRouter();
  const go = (key: string, value: string) =>
    router.push(`/datasets?${filtersToQuery(filters, { [key]: value })}`);

  const categoryData = overview.byCategory.map((c) => ({ ...c }));
  const series = VARIANT_ORDER.map((kind) => ({
    key: kind,
    label: VARIANT_LABELS[kind],
    color: VARIANT_COLOR[kind],
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Category별 샘플 수</CardTitle>
          <CardDescription>
            variant(longer / longans / shortans)로 나눈 누적 막대. 막대를 클릭하면 Dataset 목록으로
            이동합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {categoryData.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              표시할 Dataset이 없습니다.
            </p>
          ) : (
            <StackedBarChart
              data={categoryData}
              categoryKey="category"
              series={series}
              onBarClick={(category) => go(FILTER_KEYS.category, category)}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Datapack 비율</CardTitle>
            <CardDescription>Datapack별 샘플 수와 Dataset 수</CardDescription>
          </CardHeader>
          <CardContent>
            <ShareBars
              color={SERIES[0]}
              items={overview.byDatapack.map((d) => ({
                label: d.datapack,
                value: d.nSamples,
                hint: `Dataset ${d.nDatasets}개`,
              }))}
              onItemClick={(datapack) => go(FILTER_KEYS.datapack, datapack)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>언어 비율</CardTitle>
          </CardHeader>
          <CardContent>
            <ShareBars
              color={SERIES[2]}
              items={overview.byLanguage.map((l) => ({ label: l.language, value: l.nSamples }))}
              onItemClick={(language) => go(FILTER_KEYS.language, language)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
