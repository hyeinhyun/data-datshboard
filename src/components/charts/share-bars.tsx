"use client";

import { formatInt, formatPercent } from "@/lib/format";

type ShareBarsProps = {
  items: { label: string; value: number; hint?: string }[];
  color: string;
  onItemClick?: (label: string) => void;
  emptyText?: string;
};

/**
 * Proportional horizontal bars rendered in plain HTML — a single series, so one
 * hue and direct labels; no legend needed.
 */
export function ShareBars({
  items,
  color,
  onItemClick,
  emptyText = "데이터 없음",
}: ShareBarsProps) {
  const total = items.reduce((n, i) => n + i.value, 0);
  const max = Math.max(...items.map((i) => i.value), 0);
  if (items.length === 0 || total === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">{emptyText}</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const width = max ? (item.value / max) * 100 : 0;
        const Row = onItemClick ? "button" : "div";
        return (
          <li key={item.label}>
            <Row
              type={onItemClick ? "button" : undefined}
              onClick={onItemClick ? () => onItemClick(item.label) : undefined}
              className="hover:bg-muted/60 block w-full rounded-md px-1 py-0.5 text-left"
              title={`${item.label}: ${formatInt(item.value)} (${formatPercent(item.value, total)})`}
            >
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate font-medium">{item.label}</span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {formatInt(item.value)} · {formatPercent(item.value, total)}
                </span>
              </div>
              <div className="bg-muted mt-1 h-2 w-full overflow-hidden rounded-sm">
                <div
                  className="h-full rounded-sm"
                  style={{ width: `${width}%`, background: color }}
                />
              </div>
              {item.hint ? (
                <p className="text-muted-foreground mt-0.5 text-[11px]">{item.hint}</p>
              ) : null}
            </Row>
          </li>
        );
      })}
    </ul>
  );
}
