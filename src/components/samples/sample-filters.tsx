"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Image as ImageIcon, LayoutGrid, List, Search, Shuffle, Table2, X } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatInt } from "@/lib/format";
import type { VariantRef } from "@/lib/queries/datasets";
import type { SampleView } from "@/lib/sample-filters";

type SampleFiltersBarProps = {
  variants: VariantRef[];
  total: number;
  view: SampleView;
};

const ALL = "all";

export function SampleFiltersBar({ variants, total, view }: SampleFiltersBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();
  // Keep the box in sync when the URL changes from elsewhere (chips, back button)
  // by adjusting state during render instead of in an effect.
  const urlQ = sp.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ);
  if (urlQ !== prevUrlQ) {
    setPrevUrlQ(urlQ);
    setQ(urlQ);
  }

  const update = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(sp.toString());
    mutate(p);
    p.delete("page");
    p.delete("sample");
    startTransition(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  };

  const byDataset = new Map<string, VariantRef[]>();
  for (const v of variants) {
    const key = `${v.datapack} / ${v.dataset}`;
    byDataset.set(key, [...(byDataset.get(key) ?? []), v]);
  }
  const items: Record<string, string> = { [ALL]: "모든 variant" };
  for (const v of variants) items[String(v.id)] = `${v.dataset} · ${v.kind}`;

  const img = sp.get("img");
  const current = sp.get("variant") ?? ALL;

  async function random() {
    const p = new URLSearchParams(sp.toString());
    p.set("random", "1");
    const res = await fetch(`/api/samples?${p.toString()}`);
    const json = (await res.json()) as { id: number | null };
    if (json.id) {
      const next = new URLSearchParams(sp.toString());
      next.set("sample", String(json.id));
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        items={items}
        value={current}
        onValueChange={(value) =>
          update((p) => {
            if (!value || value === ALL) p.delete("variant");
            else p.set("variant", String(value));
          })
        }
      >
        <SelectTrigger className="min-w-64" aria-label="variant 선택">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>모든 variant</SelectItem>
          {Array.from(byDataset, ([label, vs]) => (
            <SelectGroup key={label}>
              <SelectLabel>{label}</SelectLabel>
              {vs.map((v) => (
                <SelectItem key={v.id} value={String(v.id)}>
                  {v.dataset} · {v.kind}
                  <span className="text-muted-foreground ml-1 text-xs">
                    ({formatInt(v.nIndexed)})
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          update((p) => (q.trim() ? p.set("q", q.trim()) : p.delete("q")));
        }}
      >
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="질문 검색…"
          className="h-8 w-64 pl-7"
          aria-label="샘플 검색"
        />
        {q ? (
          <button
            type="button"
            aria-label="검색어 지우기"
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
            onClick={() => {
              setQ("");
              update((p) => p.delete("q"));
            }}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </form>

      <Button
        size="sm"
        variant={img === "1" ? "default" : "outline"}
        onClick={() => update((p) => (img === "1" ? p.delete("img") : p.set("img", "1")))}
        title="이미지가 있는 샘플만"
      >
        <ImageIcon /> 이미지
      </Button>
      <Button
        size="sm"
        variant={sp.get("minTurns") === "2" ? "default" : "outline"}
        onClick={() =>
          update((p) => (p.get("minTurns") === "2" ? p.delete("minTurns") : p.set("minTurns", "2")))
        }
        title="2턴 이상 멀티턴 샘플만"
      >
        멀티턴
      </Button>

      <Button size="sm" variant="outline" onClick={random} disabled={total === 0}>
        <Shuffle /> 무작위
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-muted-foreground text-xs tabular-nums">{formatInt(total)}개</span>
        <div className="flex rounded-md border">
          <Button
            size="icon-sm"
            variant={view === "grid" ? "secondary" : "ghost"}
            aria-label="그리드 보기"
            onClick={() => update((p) => p.delete("view"))}
          >
            <LayoutGrid />
          </Button>
          <Button
            size="icon-sm"
            variant={view === "list" ? "secondary" : "ghost"}
            aria-label="리스트 보기"
            onClick={() => update((p) => p.set("view", "list"))}
          >
            <List />
          </Button>
          <Button
            size="icon-sm"
            variant={view === "table" ? "secondary" : "ghost"}
            aria-label="표 보기 (이미지 · Question · GT)"
            title="표 보기 (이미지 · Question · GT)"
            onClick={() => update((p) => p.set("view", "table"))}
          >
            <Table2 />
          </Button>
        </div>
      </div>
    </div>
  );
}
