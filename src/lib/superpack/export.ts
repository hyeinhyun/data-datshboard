import ExcelJS from "exceljs";

import { VARIANT_KINDS } from "@/lib/manifest/types";
import { datasetAggregates, type SuperpackDetail } from "@/lib/queries/superpacks";

/** Header row in the same shape as the team's manifest, so a re-import round-trips. */
export const MANIFEST_HEADER = [
  "Datapack",
  "Category",
  "Sub-category",
  "언어",
  "Dataset",
  "orign json",
  "longer:\njson path",
  "longer:\n# sample",
  "longans:\njson path",
  "longans:\n# sample",
  "shortans:\njson path",
  "shortans:\n# sample",
  "longer:\nsft weight",
  "longans:\nsft weight",
  "shortans:\nsft weight",
  "MX weight (1)",
  "MX weight (2)",
  "# samples in total",
  "# samples in training",
  "# samples in MX weight",
  "# samples in MX weight (2)",
  "비고",
] as const;

type Cell = string | number | null;

export function superpackRows(sp: SuperpackDetail): Cell[][] {
  return sp.datasets.map((d) => {
    const v = (kind: string) => d.variants.find((x) => x.kind === kind);
    const agg = datasetAggregates(d);
    return [
      d.datapack,
      d.category,
      d.subCategory,
      d.language,
      d.name,
      null, // origin json is not part of DatasetRow; filled by the caller when available
      v("longer")?.jsonPath ?? null,
      v("longer")?.nSamples ?? 0,
      v("longans")?.jsonPath ?? null,
      v("longans")?.nSamples ?? 0,
      v("shortans")?.jsonPath ?? null,
      v("shortans")?.nSamples ?? 0,
      v("longer")?.sftWeight ?? null,
      v("longans")?.sftWeight ?? null,
      v("shortans")?.sftWeight ?? null,
      d.mxWeight1,
      d.mxWeight2,
      agg.nTotal,
      agg.nTraining,
      agg.nMx1,
      agg.nMx2,
      d.note,
    ];
  });
}

export async function superpackToXlsx(
  sp: SuperpackDetail,
  originJson: Map<number, string | null>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sp.name.slice(0, 31).replace(/[\\/?*[\]:]/g, "_"));
  ws.addRow([...MANIFEST_HEADER]);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { wrapText: true, vertical: "top" };
  const rows = superpackRows(sp);
  rows.forEach((row, i) => {
    row[5] = originJson.get(sp.datasets[i].id) ?? null;
    ws.addRow(row);
  });
  ws.columns.forEach((col, i) => {
    col.width = i === 6 || i === 8 || i === 10 ? 60 : 16;
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Machine-readable export for training scripts: paths and weights per dataset/variant. */
export function superpackToJson(sp: SuperpackDetail) {
  return {
    superpack: sp.name,
    description: sp.description,
    source: sp.source,
    exported_at: new Date().toISOString(),
    totals: sp.totals,
    datapacks: sp.datapacks.map((p) => p.name),
    datasets: sp.datasets.map((d) => {
      const agg = datasetAggregates(d);
      return {
        datapack: d.datapack,
        dataset: d.name,
        category: d.category,
        sub_category: d.subCategory,
        language: d.language,
        tags: d.tags,
        mx_weight_1: d.mxWeight1,
        mx_weight_2: d.mxWeight2,
        n_samples_total: agg.nTotal,
        n_samples_training: agg.nTraining,
        n_samples_mx_weight_1: agg.nMx1,
        n_samples_mx_weight_2: agg.nMx2,
        variants: Object.fromEntries(
          [...VARIANT_KINDS, "default"]
            .map((kind) => [kind, d.variants.find((v) => v.kind === kind)] as const)
            .filter(([, v]) => v)
            .map(([kind, v]) => [
              kind,
              { json_path: v!.jsonPath, n_samples: v!.nSamples, sft_weight: v!.sftWeight },
            ]),
        ),
      };
    }),
  };
}
