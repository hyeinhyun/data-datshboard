import type { Metadata } from "next";

import { DatasetsTable } from "@/components/datasets/datasets-table";
import { FilterBar } from "@/components/overview/filter-bar";
import { getDb } from "@/lib/db/client";
import { parseOverviewFilters, type SearchParams } from "@/lib/filters";
import { getOverview, listSuperpacks } from "@/lib/queries/overview";

export const metadata: Metadata = { title: "Dataset" };
export const dynamic = "force-dynamic";

export default async function DatasetsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const db = getDb();
  const superpacks = listSuperpacks(db);
  // The dataset table defaults to "all datasets"; the overview's chart links pass sp= explicitly.
  const filters = parseOverviewFilters(sp, null);
  const overview = getOverview(db, filters);
  const selected = superpacks.find((s) => s.id === filters.superpackId) ?? null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">Dataset</h2>
        <p className="text-muted-foreground text-sm">
          {selected ? `Superpack "${selected.name}"에 포함된 Dataset` : "등록된 모든 Dataset"} ·
          행을 클릭하면 상세로 이동합니다.
        </p>
      </div>
      <FilterBar
        superpacks={superpacks}
        superpackId={filters.superpackId}
        options={overview.options}
      />
      <DatasetsTable rows={overview.datasets} showWeights={selected !== null} />
    </div>
  );
}
