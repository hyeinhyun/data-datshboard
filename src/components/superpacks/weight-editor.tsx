"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { variantSamples, type DatasetRow } from "@/lib/domain";
import { formatInt } from "@/lib/format";

type WeightEditorProps = { superpackId: number; rows: DatasetRow[]; readOnly?: boolean };

type Draft = Record<number, { mx1: string; mx2: string }>;

function toDraft(rows: DatasetRow[]): Draft {
  return Object.fromEntries(
    rows.map((d) => [d.id, { mx1: String(d.mxWeight1 ?? 1), mx2: String(d.mxWeight2 ?? 1) }]),
  );
}

function num(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Editable MX weights with live recomputation of per-dataset and total sample counts. */
export function WeightEditor({ superpackId, rows, readOnly = false }: WeightEditorProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(rows));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const computed = useMemo(
    () =>
      rows.map((d) => {
        const total = variantSamples(d);
        const w = draft[d.id] ?? { mx1: "1", mx2: "1" };
        const mx1 = num(w.mx1);
        const mx2 = num(w.mx2);
        return {
          d,
          total,
          mx1,
          mx2,
          nMx1: Math.round(total * (mx1 ?? 1)),
          nMx2: Math.round(total * (mx2 ?? 1)),
          changed: (mx1 ?? 1) !== (d.mxWeight1 ?? 1) || (mx2 ?? 1) !== (d.mxWeight2 ?? 1),
          invalid: mx1 === null || mx2 === null,
        };
      }),
    [rows, draft],
  );
  const totals = computed.reduce(
    (acc, r) => ({ total: acc.total + r.total, nMx1: acc.nMx1 + r.nMx1, nMx2: acc.nMx2 + r.nMx2 }),
    { total: 0, nMx1: 0, nMx2: 0 },
  );
  const changed = computed.filter((r) => r.changed);
  const invalid = computed.some((r) => r.invalid);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/superpacks/${superpackId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          weights: changed.map((r) => ({ datasetId: r.d.id, mxWeight1: r.mx1, mxWeight2: r.mx2 })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const setCell = (id: number, key: "mx1" | "mx2", value: string) =>
    setDraft((cur) => ({ ...cur, [id]: { ...(cur[id] ?? { mx1: "1", mx2: "1" }), [key]: value } }));

  return (
    <div className="grid gap-3">
      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={save} disabled={busy || changed.length === 0 || invalid}>
            {busy ? <Loader2 className="animate-spin" /> : <Save />} 가중치 저장
            {changed.length ? ` (${changed.length})` : ""}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDraft(toDraft(rows))}
            disabled={changed.length === 0}
          >
            <RotateCcw /> 되돌리기
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setDraft(Object.fromEntries(rows.map((d) => [d.id, { mx1: "1", mx2: "1" }])))
            }
          >
            모두 1로
          </Button>
          {invalid ? (
            <span className="text-destructive text-xs">0 이상의 숫자를 입력하세요.</span>
          ) : null}
          {error ? <span className="text-destructive text-xs">{error}</span> : null}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datapack</TableHead>
              <TableHead>Dataset</TableHead>
              <TableHead className="text-right">샘플</TableHead>
              <TableHead className="w-28 text-right">MX (1)</TableHead>
              <TableHead className="text-right">MX(1) 샘플</TableHead>
              <TableHead className="w-28 text-right">MX (2)</TableHead>
              <TableHead className="text-right">MX(2) 샘플</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {computed.map((r) => (
              <TableRow
                key={r.d.id}
                className={
                  r.changed ? "bg-[color-mix(in_oklch,var(--series-4),transparent_90%)]" : undefined
                }
              >
                <TableCell className="whitespace-nowrap">{r.d.datapack}</TableCell>
                <TableCell className="max-w-64 truncate font-medium">
                  <Link href={`/datasets/${r.d.id}`} className="hover:underline">
                    {r.d.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatInt(r.total)}</TableCell>
                <TableCell className="text-right">
                  {readOnly ? (
                    <span className="tabular-nums">{draft[r.d.id]?.mx1}</span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      step={0.05}
                      value={draft[r.d.id]?.mx1 ?? ""}
                      onChange={(e) => setCell(r.d.id, "mx1", e.target.value)}
                      className="h-7 w-24 text-right tabular-nums"
                      aria-label={`${r.d.name} MX weight 1`}
                    />
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatInt(r.nMx1)}</TableCell>
                <TableCell className="text-right">
                  {readOnly ? (
                    <span className="tabular-nums">{draft[r.d.id]?.mx2}</span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      step={0.05}
                      value={draft[r.d.id]?.mx2 ?? ""}
                      onChange={(e) => setCell(r.d.id, "mx2", e.target.value)}
                      className="h-7 w-24 text-right tabular-nums"
                      aria-label={`${r.d.name} MX weight 2`}
                    />
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatInt(r.nMx2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>합계</TableCell>
              <TableCell className="text-right tabular-nums">{formatInt(totals.total)}</TableCell>
              <TableCell />
              <TableCell className="text-right tabular-nums">{formatInt(totals.nMx1)}</TableCell>
              <TableCell />
              <TableCell className="text-right tabular-nums">{formatInt(totals.nMx2)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
