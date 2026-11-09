"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCompact, formatInt } from "@/lib/format";

export type StackedSeries = { key: string; label: string; color: string };

type StackedBarChartProps = {
  data: Record<string, string | number>[];
  categoryKey: string;
  series: StackedSeries[];
  height?: number;
  onBarClick?: (category: string) => void;
};

/** Horizontal stacked bars: one row per category, one segment per series (fixed colors). */
export function StackedBarChart({
  data,
  categoryKey,
  series,
  height,
  onBarClick,
}: StackedBarChartProps) {
  const activeSeries = series.filter((s) => data.some((d) => Number(d[s.key]) > 0));
  const h = height ?? Math.max(160, 28 * data.length + 56);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
        barCategoryGap={6}
      >
        <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
        <XAxis
          type="number"
          tickFormatter={formatCompact}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={{ stroke: "var(--viz-axis)" }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey={categoryKey}
          width={150}
          tick={{ fontSize: 11, fill: "var(--foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--popover-foreground)",
          }}
          formatter={(value, name) => [formatInt(Number(value)), String(name)]}
        />
        {activeSeries.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        {activeSeries.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId="a"
            fill={s.color}
            stroke="var(--card)"
            strokeWidth={1}
            radius={i === activeSeries.length - 1 ? [0, 4, 4, 0] : 0}
            maxBarSize={22}
            cursor={onBarClick ? "pointer" : undefined}
            onClick={(entry) => {
              const payload = (entry as { payload?: Record<string, unknown> }).payload;
              const category = payload?.[categoryKey];
              if (onBarClick && typeof category === "string") onBarClick(category);
            }}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
