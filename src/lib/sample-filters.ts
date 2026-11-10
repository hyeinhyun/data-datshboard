import type { SampleFilters } from "@/lib/queries/samples";

export type SampleSearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/** Parses the sample explorer's URL state (shared by the page and the /api/samples route). */
export function parseSampleFilters(sp: SampleSearchParams): SampleFilters {
  const int = (k: string): number | null => {
    const v = first(sp[k]);
    return v && /^\d+$/.test(v) ? Number(v) : null;
  };
  const img = first(sp.img);
  return {
    variantId: int("variant"),
    datasetId: int("dataset"),
    q: first(sp.q)?.trim() || undefined,
    hasImage: img === "1" ? true : img === "0" ? false : null,
    minTurns: int("minTurns"),
    maxTurns: int("maxTurns"),
  };
}

export function sampleFiltersToParams(f: SampleFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.variantId) p.set("variant", String(f.variantId));
  else if (f.datasetId) p.set("dataset", String(f.datasetId));
  if (f.q) p.set("q", f.q);
  if (f.hasImage === true) p.set("img", "1");
  if (f.hasImage === false) p.set("img", "0");
  if (f.minTurns) p.set("minTurns", String(f.minTurns));
  if (f.maxTurns) p.set("maxTurns", String(f.maxTurns));
  return p;
}

export type SampleView = "grid" | "list" | "table";

export function parseSampleView(v: string | string[] | undefined): SampleView {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "list" || s === "table" ? s : "grid";
}

/** Builds a /samples URL for the given filters, optionally opening one sample and/or a page. */
export function samplesHref(
  f: SampleFilters,
  extra: { sample?: number | null; page?: number; view?: string | null } = {},
): string {
  const p = sampleFiltersToParams(f);
  if (extra.page && extra.page > 1) p.set("page", String(extra.page));
  if (extra.view) p.set("view", extra.view);
  if (extra.sample) p.set("sample", String(extra.sample));
  const qs = p.toString();
  return qs ? `/samples?${qs}` : "/samples";
}
