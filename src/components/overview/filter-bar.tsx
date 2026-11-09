"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import { useCallback, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FILTER_KEYS } from "@/lib/filters";
import { VARIANT_KINDS } from "@/lib/manifest/types";
import type { Overview, SuperpackSummary } from "@/lib/queries/overview";

type FilterBarProps = {
  superpacks: SuperpackSummary[];
  superpackId: number | null;
  options: Overview["options"];
  /** Hide the superpack picker on pages where it does not apply. */
  showSuperpack?: boolean;
};

const ALL = "all";

export function FilterBar({
  superpacks,
  superpackId,
  options,
  showSuperpack = true,
}: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const current = useCallback(
    (key: string): string[] => (searchParams.get(key) ?? "").split(",").filter(Boolean),
    [searchParams],
  );

  const update = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  const toggle = (key: string, value: string) =>
    update((params) => {
      const values = new Set(current(key));
      if (values.has(value)) values.delete(value);
      else values.add(value);
      if (values.size) params.set(key, Array.from(values).join(","));
      else params.delete(key);
    });

  const activeChips = (
    [
      [FILTER_KEYS.datapack, "Datapack"],
      [FILTER_KEYS.category, "Category"],
      [FILTER_KEYS.subCategory, "Sub"],
      [FILTER_KEYS.language, "언어"],
      [FILTER_KEYS.variant, "variant"],
      [FILTER_KEYS.tag, "태그"],
    ] as const
  ).flatMap(([key, label]) => current(key).map((value) => ({ key, label, value })));

  const superpackItems: Record<string, string> = { [ALL]: "전체 Dataset" };
  for (const s of superpacks) superpackItems[String(s.id)] = s.name;

  return (
    <div className="flex flex-col gap-2" data-pending={isPending || undefined}>
      <div className="flex flex-wrap items-center gap-2">
        {showSuperpack ? (
          <Select
            items={superpackItems}
            value={superpackId === null ? ALL : String(superpackId)}
            onValueChange={(value) =>
              update((params) => {
                params.set(FILTER_KEYS.superpack, String(value ?? ALL));
                // A different superpack has different datapacks; drop stale selections.
                params.delete(FILTER_KEYS.datapack);
              })
            }
          >
            <SelectTrigger className="min-w-56" aria-label="Superpack 선택">
              <span className="text-muted-foreground mr-1 text-xs">Superpack</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체 Dataset</SelectItem>
              {superpacks.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <MultiFilter
          label="Datapack"
          values={options.datapacks}
          selected={current(FILTER_KEYS.datapack)}
          onToggle={(v) => toggle(FILTER_KEYS.datapack, v)}
        />
        <MultiFilter
          label="Category"
          values={options.categories}
          selected={current(FILTER_KEYS.category)}
          onToggle={(v) => toggle(FILTER_KEYS.category, v)}
        />
        <MultiFilter
          label="Sub-category"
          values={options.subCategories}
          selected={current(FILTER_KEYS.subCategory)}
          onToggle={(v) => toggle(FILTER_KEYS.subCategory, v)}
        />
        <MultiFilter
          label="언어"
          values={options.languages}
          selected={current(FILTER_KEYS.language)}
          onToggle={(v) => toggle(FILTER_KEYS.language, v)}
        />
        <MultiFilter
          label="variant"
          values={[...VARIANT_KINDS]}
          selected={current(FILTER_KEYS.variant)}
          onToggle={(v) => toggle(FILTER_KEYS.variant, v)}
        />
        <MultiFilter
          label="태그"
          values={options.tags}
          selected={current(FILTER_KEYS.tag)}
          onToggle={(v) => toggle(FILTER_KEYS.tag, v)}
          emptyText="태그 없음"
        />

        {activeChips.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              update((params) => {
                for (const key of Object.values(FILTER_KEYS))
                  if (key !== FILTER_KEYS.superpack) params.delete(key);
              })
            }
          >
            필터 초기화
          </Button>
        ) : null}
      </div>
      {activeChips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {activeChips.map((chip) => (
            <Badge key={`${chip.key}:${chip.value}`} variant="secondary" className="gap-1 pr-1">
              <span className="text-muted-foreground">{chip.label}:</span> {chip.value}
              <button
                type="button"
                aria-label={`${chip.label} ${chip.value} 제거`}
                className="hover:bg-muted-foreground/20 ml-0.5 rounded-sm"
                onClick={() => toggle(chip.key, chip.value)}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type MultiFilterProps = {
  label: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
  emptyText?: string;
};

function MultiFilter({
  label,
  values,
  selected,
  onToggle,
  emptyText = "선택 가능한 값 없음",
}: MultiFilterProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={selected.length ? "border-primary/60" : undefined}
          />
        }
      >
        {label}
        {selected.length ? (
          <Badge variant="default" className="h-4 min-w-4 px-1 text-[10px]">
            {selected.length}
          </Badge>
        ) : null}
        <ChevronDown className="text-muted-foreground size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-48 overflow-y-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {values.length === 0 ? (
            <p className="text-muted-foreground px-2 py-1.5 text-xs">{emptyText}</p>
          ) : (
            values.map((value) => (
              <DropdownMenuCheckboxItem
                key={value}
                checked={selected.includes(value)}
                onCheckedChange={() => onToggle(value)}
                closeOnClick={false}
              >
                {value}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
