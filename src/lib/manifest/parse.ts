import ExcelJS from "exceljs";
import Papa from "papaparse";

import { normalizeHeader, parseNumber, parseText } from "./normalize";
import {
  VARIANT_KINDS,
  type ManifestColumn,
  type ManifestRow,
  type ManifestSheet,
  type NormalizedColumn,
  type ParsedManifest,
} from "./types";

type Cell = string | number | null;
type Grid = Cell[][];

/** Parses an .xlsx (every sheet) or .csv/.tsv (one sheet) manifest. */
export async function parseManifest(buffer: Buffer, fileName: string): Promise<ParsedManifest> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    return { fileName, sheets: await parseWorkbook(buffer) };
  }
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
    const sheetName = fileName.replace(/\.[^.]+$/, "");
    return { fileName, sheets: [parseGrid(sheetName, parseDelimited(buffer.toString("utf8")))] };
  }
  throw new Error(`지원하지 않는 파일 형식입니다: ${fileName} (xlsx, csv, tsv만 가능)`);
}

async function parseWorkbook(buffer: Buffer): Promise<ManifestSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheets: ManifestSheet[] = [];
  workbook.eachSheet((worksheet) => {
    if (worksheet.state === "hidden" || worksheet.state === "veryHidden") return;
    const grid: Grid = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: Cell[] = [];
      // exceljs row.values is 1-based with an empty slot at index 0.
      const values = row.values as ExcelJS.CellValue[];
      for (let c = 1; c < values.length; c++) cells[c - 1] = cellToPrimitive(values[c]);
      grid[rowNumber - 1] = cells;
    });
    sheets.push(parseGrid(worksheet.name, grid.filter(Boolean)));
  });
  return sheets;
}

function cellToPrimitive(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value && value.text !== undefined) return String(value.text);
    if ("result" in value && value.result !== undefined) {
      return cellToPrimitive(value.result as ExcelJS.CellValue);
    }
    if ("error" in value) return null;
  }
  return String(value);
}

function parseDelimited(text: string): Grid {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), {
    delimiter: "",
    skipEmptyLines: "greedy",
  });
  return result.data.map((row) => row.map((v) => (v === "" ? null : v)));
}

/** Turns a 2-D grid into typed rows. The first row that contains a "dataset" column is the header. */
export function parseGrid(name: string, grid: Grid): ManifestSheet {
  const warnings: string[] = [];
  const headerIndex = grid.findIndex((row) =>
    row.some((cell) => cell !== null && normalizeHeader(String(cell)) === "dataset"),
  );
  if (headerIndex === -1) {
    return {
      name,
      columns: [],
      rows: [],
      skippedRows: grid.length,
      warnings: ["'Dataset' 컬럼이 있는 헤더 행을 찾지 못해 시트를 건너뜁니다."],
    };
  }

  const columns: ManifestColumn[] = grid[headerIndex].map((cell, index) => {
    const raw = cell === null ? "" : String(cell);
    return { index, raw, normalized: raw ? normalizeHeader(raw) : null };
  });
  for (const col of columns) {
    if (col.raw && !col.normalized)
      warnings.push(`인식하지 못한 컬럼: "${col.raw.replace(/\s+/g, " ")}"`);
  }
  const byName = new Map<NormalizedColumn, number>();
  for (const col of columns)
    if (col.normalized && !byName.has(col.normalized)) byName.set(col.normalized, col.index);

  const rows: ManifestRow[] = [];
  let skippedRows = 0;
  for (let r = headerIndex + 1; r < grid.length; r++) {
    const cells = grid[r];
    if (!cells || cells.every((c) => c === null || String(c).trim() === "")) continue;
    const get = (col: NormalizedColumn): Cell => {
      const i = byName.get(col);
      return i === undefined ? null : (cells[i] ?? null);
    };
    const dataset = parseText(get("dataset"));
    const datapack = parseText(get("datapack"));
    if (!dataset || !datapack) {
      skippedRows++;
      warnings.push(`${r + 1}행: Datapack 또는 Dataset이 비어 있어 건너뜁니다.`);
      continue;
    }
    const extra: Record<string, string> = {};
    for (const col of columns) {
      if (col.normalized || !col.raw) continue;
      const v = cells[col.index];
      if (v !== null && v !== undefined && String(v).trim() !== "") extra[col.raw] = String(v);
    }
    const variants = Object.fromEntries(
      VARIANT_KINDS.map((kind) => [
        kind,
        {
          jsonPath: parseText(get(`${kind}_json_path`)),
          nSamples: parseNumber(get(`${kind}_n_samples`)),
          sftWeight: parseNumber(get(`${kind}_sft_weight`)),
        },
      ]),
    ) as ManifestRow["variants"];

    rows.push({
      rowNumber: r + 1,
      datapack,
      dataset,
      category: parseText(get("category")),
      subCategory: parseText(get("sub_category")),
      language: parseText(get("language")),
      originJson: parseText(get("origin_json")),
      note: parseText(get("note")),
      variants,
      mxWeight1: parseNumber(get("mx_weight_1")),
      mxWeight2: parseNumber(get("mx_weight_2")),
      nTotal: parseNumber(get("n_total")),
      nTraining: parseNumber(get("n_training")),
      nMx1: parseNumber(get("n_mx1")),
      nMx2: parseNumber(get("n_mx2")),
      extra,
    });
  }
  return { name, columns, rows, skippedRows, warnings };
}

/** A variant "exists" in the manifest when it has a path or a positive sample count. */
export function variantPresent(v: { jsonPath: string | null; nSamples: number | null }): boolean {
  return Boolean(v.jsonPath) || (v.nSamples !== null && v.nSamples > 0);
}
