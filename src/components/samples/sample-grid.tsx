import Link from "next/link";
import { ImageOff, MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { VARIANT_COLOR } from "@/lib/charts/palette";
import { formatInt, truncate } from "@/lib/format";
import { imageUrl } from "@/lib/images/url";
import type { SampleListItem } from "@/lib/queries/samples";

type SampleGridProps = {
  items: SampleListItem[];
  view: "grid" | "list";
  /** Builds the href that opens a sample while keeping the current filters. */
  hrefFor: (id: number) => string;
  activeId?: number | null;
};

function Thumb({ item, className }: { item: SampleListItem; className: string }) {
  if (item.imagePaths.length === 0) {
    return (
      <div
        className={`bg-muted text-muted-foreground flex items-center justify-center ${className}`}
      >
        <ImageOff className="size-5" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- served by our own thumbnail route
    <img
      src={imageUrl(item.imagePaths[0], 256)}
      alt=""
      loading="lazy"
      className={`bg-muted object-cover ${className}`}
    />
  );
}

export function SampleGrid({ items, view, hrefFor, activeId }: SampleGridProps) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        조건에 맞는 샘플이 없습니다. variant를 고르거나 색인을 먼저 실행하세요.
      </p>
    );
  }
  if (view === "list") {
    return (
      <ul className="divide-y rounded-md border">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={hrefFor(item.id)}
              scroll={false}
              className={`hover:bg-muted/50 flex items-center gap-3 px-3 py-2 ${activeId === item.id ? "bg-muted" : ""}`}
            >
              <Thumb item={item} className="size-12 shrink-0 rounded" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {item.firstQuestion ? (
                    truncate(item.firstQuestion, 160)
                  ) : (
                    <span className="text-muted-foreground">(질문 없음)</span>
                  )}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {item.firstAnswerPreview
                    ? truncate(item.firstAnswerPreview.replace(/\s+/g, " "), 160)
                    : "–"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge variant="outline" className="gap-1">
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ background: VARIANT_COLOR[item.kind] }}
                  />
                  {item.kind}
                </Badge>
                <Badge variant="outline" className="gap-1 tabular-nums">
                  <MessageSquare className="size-3" /> {item.nTurns}
                </Badge>
                <span className="text-muted-foreground w-24 truncate text-right font-mono text-[11px]">
                  {item.sampleId ?? `#${item.id}`}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={hrefFor(item.id)}
            scroll={false}
            className={`group bg-card hover:border-foreground/30 flex h-full flex-col overflow-hidden rounded-lg border transition-colors ${activeId === item.id ? "ring-primary ring-2" : ""}`}
          >
            <Thumb item={item} className="aspect-[4/3] w-full" />
            <div className="flex flex-1 flex-col gap-1 p-2">
              <p className="line-clamp-2 text-xs leading-snug">
                {item.firstQuestion ?? <span className="text-muted-foreground">(질문 없음)</span>}
              </p>
              <div className="text-muted-foreground mt-auto flex items-center justify-between gap-1 text-[11px]">
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ background: VARIANT_COLOR[item.kind] }}
                  />
                  {item.kind}
                </span>
                <span className="tabular-nums">
                  {item.nTurns}턴 · {formatInt(item.aChars)}자
                </span>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
