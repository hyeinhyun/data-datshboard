import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInt, formatWeight } from "@/lib/format";
import { VARIANT_KINDS } from "@/lib/manifest/types";
import { variantSamples, type DatasetRow } from "@/lib/queries/overview";

type WeightsTableProps = { datasets: DatasetRow[]; showWeights: boolean };

/** Dataset rows with per-variant sample counts and the superpack's mix weights. */
export function WeightsTable({ datasets, showWeights }: WeightsTableProps) {
  if (datasets.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">표시할 Dataset이 없습니다.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Datapack</TableHead>
            <TableHead>Dataset</TableHead>
            <TableHead>Category</TableHead>
            {VARIANT_KINDS.map((k) => (
              <TableHead key={k} className="text-right">
                {k}
              </TableHead>
            ))}
            <TableHead className="text-right">합계</TableHead>
            {showWeights ? (
              <>
                <TableHead className="text-right">MX (1)</TableHead>
                <TableHead className="text-right">MX (2)</TableHead>
              </>
            ) : null}
            <TableHead>태그</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {datasets.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="whitespace-nowrap">{d.datapack}</TableCell>
              <TableCell className="max-w-64 truncate font-medium">
                <Link href={`/datasets/${d.id}`} className="hover:underline">
                  {d.name}
                </Link>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {d.category ?? "–"}
                {d.subCategory ? (
                  <span className="text-muted-foreground"> / {d.subCategory}</span>
                ) : null}
              </TableCell>
              {VARIANT_KINDS.map((k) => {
                const v = d.variants.find((x) => x.kind === k);
                return (
                  <TableCell key={k} className="text-right tabular-nums">
                    {v ? formatInt(v.nSamples) : <span className="text-muted-foreground">–</span>}
                  </TableCell>
                );
              })}
              <TableCell className="text-right font-medium tabular-nums">
                {formatInt(variantSamples(d))}
              </TableCell>
              {showWeights ? (
                <>
                  <TableCell className="text-right tabular-nums">
                    {formatWeight(d.mxWeight1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatWeight(d.mxWeight2)}
                  </TableCell>
                </>
              ) : null}
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {d.tags.map((t) => (
                    <Badge key={t} variant="outline">
                      {t}
                    </Badge>
                  ))}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
