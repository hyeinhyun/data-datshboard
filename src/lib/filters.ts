import { VARIANT_KINDS, type VariantKind } from "@/lib/manifest/types";
import type { OverviewFilters } from "@/lib/queries/overview";

export type SearchParams = Record<string, string | string[] | undefined>;

/** URL keys shared by the overview, dataset table and sample explorer. */
export const FILTER_KEYS = {
  superpack: "sp",
  datapack: "dp",
  category: "cat",
  subCategory: "sub",
  language: "lang",
  variant: "var",
  tag: "tag",
  q: "q",
} as const;

function list(sp: SearchParams, key: string): string[] {
  const raw = sp[key];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

export function parseOverviewFilters(
  sp: SearchParams,
  defaultSuperpackId: number | null,
): OverviewFilters {
  const spValue = sp[FILTER_KEYS.superpack];
  const spRaw = typeof spValue === "string" ? spValue : undefined;
  let superpackId: number | null = defaultSuperpackId;
  if (spRaw === "all") superpackId = null;
  else if (spRaw && /^\d+$/.test(spRaw)) superpackId = Number(spRaw);
  return {
    superpackId,
    datapack: list(sp, FILTER_KEYS.datapack),
    category: list(sp, FILTER_KEYS.category),
    subCategory: list(sp, FILTER_KEYS.subCategory),
    language: list(sp, FILTER_KEYS.language),
    variant: list(sp, FILTER_KEYS.variant).filter((v): v is VariantKind =>
      (VARIANT_KINDS as readonly string[]).includes(v),
    ),
    tag: list(sp, FILTER_KEYS.tag),
  };
}

/** Serialises filters back into a query string (shared by chart click-through links). */
export function filtersToQuery(f: OverviewFilters, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  params.set(FILTER_KEYS.superpack, f.superpackId === null ? "all" : String(f.superpackId));
  const put = (key: string, values?: string[]) => {
    if (values && values.length) params.set(key, values.join(","));
  };
  put(FILTER_KEYS.datapack, f.datapack);
  put(FILTER_KEYS.category, f.category);
  put(FILTER_KEYS.subCategory, f.subCategory);
  put(FILTER_KEYS.language, f.language);
  put(FILTER_KEYS.variant, f.variant);
  put(FILTER_KEYS.tag, f.tag);
  for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v);
  return params.toString();
}
