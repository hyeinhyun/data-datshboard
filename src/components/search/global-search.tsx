"use client";

import { useRouter } from "next/navigation";
import { Database, Images, Layers, Package, Search, Tag } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SearchHit } from "@/lib/queries/search";

const GROUPS: { type: SearchHit["type"]; label: string; icon: typeof Database }[] = [
  { type: "superpack", label: "Superpack", icon: Layers },
  { type: "datapack", label: "Datapack", icon: Package },
  { type: "dataset", label: "Dataset", icon: Database },
  { type: "tag", label: "태그", icon: Tag },
  { type: "sample", label: "샘플", icon: Images },
];

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const json = (await res.json()) as { hits: SearchHit[] };
        setHits(json.hits);
      } catch {
        /* aborted or network error: keep previous hits */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  // Hits from a previous query are hidden as soon as the box is cleared.
  const visibleHits = query.trim() ? hits : [];

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-56 justify-start gap-2"
        onClick={() => setOpen(true)}
        aria-label="전역 검색 열기"
      >
        <Search className="size-4" />
        <span className="text-muted-foreground">검색…</span>
        <kbd className="bg-muted text-muted-foreground ml-auto rounded border px-1.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>전역 검색</DialogTitle>
            <DialogDescription>Superpack, Datapack, Dataset, 태그, 샘플 검색</DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false} className="**:data-[slot=command-input-wrapper]:h-12">
            <CommandInput
              placeholder="이름, 카테고리, 경로, 질문 내용…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>
                {loading ? "검색 중…" : query.trim() ? "결과 없음" : "검색어를 입력하세요"}
              </CommandEmpty>
              {GROUPS.map((g) => {
                const items = visibleHits.filter((h) => h.type === g.type);
                if (items.length === 0) return null;
                return (
                  <CommandGroup key={g.type} heading={g.label}>
                    {items.map((h) => (
                      <CommandItem
                        key={`${h.type}-${h.id}`}
                        value={`${h.type}-${h.id}`}
                        onSelect={() => {
                          setOpen(false);
                          router.push(h.href);
                        }}
                      >
                        <g.icon className="text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate">{h.title}</p>
                          {h.subtitle ? (
                            <p className="text-muted-foreground truncate text-xs">{h.subtitle}</p>
                          ) : null}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
