import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { SampleDetailSheet } from "@/components/samples/sample-detail";
import { SampleFiltersBar } from "@/components/samples/sample-filters";
import { SampleGrid } from "@/components/samples/sample-grid";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db/client";
import { formatInt } from "@/lib/format";
import { listVariants } from "@/lib/queries/datasets";
import {
  liveQuestionAnswers,
  getSample,
  listSamples,
  sampleNeighbors,
  sampleStats,
} from "@/lib/queries/samples";
import {
  parseSampleFilters,
  parseSampleView,
  samplesHref,
  type SampleSearchParams,
} from "@/lib/sample-filters";

export const metadata: Metadata = { title: "샘플" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

export default async function SamplesPage({
  searchParams,
}: {
  searchParams: Promise<SampleSearchParams>;
}) {
  const sp = await searchParams;
  const db = getDb();
  const filters = parseSampleFilters(sp);
  const view = parseSampleView(sp.view);
  const viewParam = view === "grid" ? null : view;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const sampleId =
    typeof sp.sample === "string" && /^\d+$/.test(sp.sample) ? Number(sp.sample) : null;

  const variants = listVariants(db, true);
  const { items, total } = listSamples(db, filters, page, PAGE_SIZE);
  const stats = sampleStats(db, filters);
  const qa =
    view === "table"
      ? liveQuestionAnswers(
          db,
          items.map((i) => i.id),
        )
      : undefined;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const sample = sampleId ? getSample(db, sampleId) : null;
  const neighbors = sample ? sampleNeighbors(db, sample.id, filters) : null;
  const hrefFor = (id: number) => samplesHref(filters, { sample: id, page, view: viewParam });

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">샘플</h2>
        <p className="text-muted-foreground text-sm">
          {variants.length === 0
            ? "색인된 variant가 없습니다. Dataset 상세에서 색인을 실행하세요."
            : `색인된 샘플 ${formatInt(stats.total)}개 · 이미지 포함 ${formatInt(stats.withImages)}개 · 평균 ${stats.avgTurns.toFixed(1)}턴 · 평균 답변 ${formatInt(stats.avgAChars)}자`}
        </p>
      </div>

      <SampleFiltersBar variants={variants} total={total} view={view} />

      <SampleGrid
        items={items}
        view={view}
        qa={qa}
        hrefFor={hrefFor}
        activeId={sample?.id ?? null}
      />

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            nativeButton={page <= 1}
            render={
              page > 1 ? (
                <Link
                  href={samplesHref(filters, {
                    page: page - 1,
                    view: viewParam,
                  })}
                />
              ) : undefined
            }
          >
            <ChevronLeft /> 이전
          </Button>
          <span className="text-muted-foreground text-xs tabular-nums">
            {page} / {pages} 페이지
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pages}
            nativeButton={page >= pages}
            render={
              page < pages ? (
                <Link
                  href={samplesHref(filters, {
                    page: page + 1,
                    view: viewParam,
                  })}
                />
              ) : undefined
            }
          >
            다음 <ChevronRight />
          </Button>
        </div>
      ) : null}

      {sample && neighbors ? (
        <SampleDetailSheet
          sample={sample}
          prevHref={neighbors.prevId ? hrefFor(neighbors.prevId) : null}
          nextHref={neighbors.nextId ? hrefFor(neighbors.nextId) : null}
          closeHref={samplesHref(filters, { page, view: viewParam })}
          position={neighbors.position}
          total={total}
          siblingLinks={sample.siblings.map((s) => ({
            kind: s.kind,
            href: samplesHref({ ...filters, variantId: s.variantId }, { sample: s.sampleRowId }),
          }))}
        />
      ) : null}
    </div>
  );
}
