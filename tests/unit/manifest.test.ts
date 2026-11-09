import fs from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { openDatabase } from "@/lib/db/client";
import { applyImport, planImport } from "@/lib/manifest/import";
import { canonicalHeader, normalizeHeader, parseNumber } from "@/lib/manifest/normalize";
import { parseManifest } from "@/lib/manifest/parse";

const FIXTURE = path.resolve(__dirname, "../../data/samples/manifest_example.tsv");

describe("normalizeHeader", () => {
  it("maps the real multi-line headers", () => {
    expect(canonicalHeader("longer:\njson path")).toBe("longer: json path");
    expect(normalizeHeader("longer:\njson path")).toBe("longer_json_path");
    expect(normalizeHeader("longans:\n# sample")).toBe("longans_n_samples");
    expect(normalizeHeader("shortans:\nsft weight")).toBe("shortans_sft_weight");
    expect(normalizeHeader("MX weight (1)")).toBe("mx_weight_1");
    expect(normalizeHeader("MX weight (2)")).toBe("mx_weight_2");
    expect(normalizeHeader("# samples in MX weight")).toBe("n_mx1");
    expect(normalizeHeader("# samples in MX weight (2)")).toBe("n_mx2");
    expect(normalizeHeader("orign json")).toBe("origin_json");
    expect(normalizeHeader("언어")).toBe("language");
    expect(normalizeHeader("비고")).toBe("note");
    expect(normalizeHeader("Sub-category")).toBe("sub_category");
    expect(normalizeHeader("Something else")).toBeNull();
  });

  it("parses numbers with thousands separators", () => {
    expect(parseNumber("34,813")).toBe(34813);
    expect(parseNumber(" 0.5 ")).toBe(0.5);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("n/a")).toBeNull();
  });
});

describe("parseManifest (tsv)", () => {
  it("reads the example manifest", async () => {
    const parsed = await parseManifest(fs.readFileSync(FIXTURE), "manifest_example.tsv");
    expect(parsed.sheets).toHaveLength(1);
    const sheet = parsed.sheets[0];
    expect(sheet.rows).toHaveLength(4);
    const lvis = sheet.rows.find((r) => r.dataset === "LVIS (OCR)");
    expect(lvis).toBeDefined();
    expect(lvis!.datapack).toBe("base");
    expect(lvis!.category).toBe("General VQA");
    expect(lvis!.variants.longer.nSamples).toBe(72670);
    expect(lvis!.variants.longans.nSamples).toBe(145626);
    expect(lvis!.variants.shortans.jsonPath).toBeNull();
    expect(lvis!.mxWeight1).toBe(0.5);
    expect(lvis!.nTotal).toBe(218296);
    expect(lvis!.note).toBe("[bbox 샘플 제외]");
    const chart = sheet.rows.find((r) => r.dataset === "syn_gen_chart (OCR)");
    expect(chart!.category).toBe("Diagram, Chart, Table");
  });
});

async function buildWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const header = [
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
  ];
  const a = wb.addWorksheet("mix_v1");
  a.addRow(header);
  a.addRow([
    "base",
    "General VQA",
    null,
    "en",
    "ShareGPT4o",
    "s.json",
    null,
    0,
    "/v/share-longans.json",
    34813,
    null,
    0,
    1,
    1,
    1,
    0.5,
    0.5,
    34813,
    34813,
    17407,
    17407,
    null,
  ]);
  a.addRow([
    "added",
    "OCR",
    "Rendered Text",
    "en",
    "eng_rendered",
    "e.json",
    null,
    0,
    "/v/eng-longans.json",
    6615,
    "/v/eng-shortans.json",
    3148,
    1,
    1,
    1,
    1,
    1,
    9763,
    9763,
    9763,
    9763,
    "note",
  ]);
  const b = wb.addWorksheet("mix_v2");
  b.addRow(header);
  // Same dataset as in mix_v1 but with a different MX weight (allowed) and a different longans path (conflict).
  b.addRow([
    "base",
    "General VQA",
    null,
    "en",
    "ShareGPT4o",
    "s.json",
    null,
    0,
    "/v/share-longans-v2.json",
    34813,
    null,
    0,
    1,
    1,
    1,
    0.25,
    1,
    34813,
    34813,
    8703,
    34813,
    null,
  ]);
  b.addRow([
    "mmoth",
    "Math",
    null,
    "en",
    "mmoth_set",
    "m.json",
    "/v/mmoth-longer.json",
    1000,
    null,
    0,
    null,
    0,
    1,
    1,
    1,
    1,
    1,
    1000,
    1000,
    1000,
    1000,
    null,
  ]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("import (xlsx, two sheets)", () => {
  it("plans and applies superpacks, datapacks, datasets, memberships and weights", async () => {
    const db = openDatabase(":memory:");
    const parsed = await parseManifest(await buildWorkbook(), "manifest.xlsx");
    expect(parsed.sheets.map((s) => s.name)).toEqual(["mix_v1", "mix_v2"]);

    const plan = planImport(db, parsed.sheets);
    expect(plan.sheets[0].newDatasets).toBe(2);
    expect(plan.sheets[1].newDatasets).toBe(1);
    expect(plan.sheets[1].existingDatasets).toBe(1);
    expect(plan.totalConflicts).toBe(0); // nothing in the DB yet

    const result = applyImport(db, parsed.sheets, { overwriteConflicts: false });
    expect(result.superpacks).toBe(2);
    expect(result.datapacksCreated).toBe(3);
    expect(result.datasetsCreated).toBe(3);
    expect(result.datasetsUpdated).toBe(1);
    // ShareGPT4o longans path differs between the two sheets → skipped in sheet 2.
    expect(result.conflictsSkipped).toBe(1);

    const memberships = db
      .prepare(
        `SELECT s.name AS superpack, p.name AS datapack FROM superpack_datapacks m
         JOIN superpacks s ON s.id = m.superpack_id JOIN datapacks p ON p.id = m.datapack_id
         ORDER BY s.name, m.position`,
      )
      .all() as { superpack: string; datapack: string }[];
    expect(memberships).toEqual([
      { superpack: "mix_v1", datapack: "base" },
      { superpack: "mix_v1", datapack: "added" },
      { superpack: "mix_v2", datapack: "base" },
      { superpack: "mix_v2", datapack: "mmoth" },
    ]);

    const weights = db
      .prepare(
        `SELECT s.name AS superpack, w.mx_weight_1 FROM superpack_dataset_weights w
         JOIN superpacks s ON s.id = w.superpack_id JOIN datasets d ON d.id = w.dataset_id
         WHERE d.name = 'ShareGPT4o' ORDER BY s.name`,
      )
      .all() as { superpack: string; mx_weight_1: number }[];
    expect(weights).toEqual([
      { superpack: "mix_v1", mx_weight_1: 0.5 },
      { superpack: "mix_v2", mx_weight_1: 0.25 },
    ]);

    // Re-planning the same file now reports the path conflict from sheet 2.
    const replan = planImport(db, parsed.sheets);
    expect(replan.totalConflicts).toBe(1);
    expect(replan.sheets[1].conflicts[0]).toMatchObject({
      dataset: "ShareGPT4o",
      kind: "longans",
      field: "json_path",
      existing: "/v/share-longans.json",
      incoming: "/v/share-longans-v2.json",
    });

    // Overwriting applies the incoming path and resets index status.
    const second = applyImport(db, parsed.sheets, { overwriteConflicts: true });
    expect(second.conflictsOverwritten).toBe(1);
    const v = db
      .prepare(
        `SELECT json_path, index_status FROM variants v JOIN datasets d ON d.id = v.dataset_id WHERE d.name = 'ShareGPT4o' AND v.kind = 'longans'`,
      )
      .get() as { json_path: string; index_status: string };
    expect(v.json_path).toBe("/v/share-longans-v2.json");
    expect(v.index_status).toBe("none");
  });
});
