"use client";

import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Save, X } from "lucide-react";
import { useMemo, useState } from "react";

import { TagChip } from "@/components/tags/tag-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatInt } from "@/lib/format";

export type ComposerDatapack = {
  id: number;
  name: string;
  nDatasets: number;
  nSamples: number;
  tags: string[];
  superpacks: string[];
};

type SuperpackComposerProps = {
  datapacks: ComposerDatapack[];
  mode: "create" | "edit";
  superpackId?: number;
  initialName?: string;
  initialDescription?: string | null;
  initialSelected?: number[];
};

export function SuperpackComposer({
  datapacks,
  mode,
  superpackId,
  initialName = "",
  initialDescription = "",
  initialSelected = [],
}: SuperpackComposerProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [selected, setSelected] = useState<number[]>(initialSelected);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(datapacks.map((d) => [d.id, d])), [datapacks]);
  const allTags = useMemo(
    () => Array.from(new Set(datapacks.flatMap((d) => d.tags))).sort(),
    [datapacks],
  );
  const candidates = datapacks.filter(
    (d) =>
      (!query || d.name.toLowerCase().includes(query.toLowerCase())) &&
      (!tagFilter || d.tags.includes(tagFilter)),
  );
  const totals = selected.reduce(
    (acc, id) => {
      const d = byId.get(id);
      if (d) {
        acc.nDatasets += d.nDatasets;
        acc.nSamples += d.nSamples;
      }
      return acc;
    },
    { nDatasets: 0, nSamples: 0 },
  );
  const dirty =
    mode === "create" ||
    selected.join(",") !== initialSelected.join(",") ||
    name !== initialName ||
    (description ?? "") !== (initialDescription ?? "");

  const toggle = (id: number) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const move = (id: number, dir: -1 | 1) =>
    setSelected((cur) => {
      const i = cur.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        const res = await fetch("/api/superpacks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, description: description || null, datapackIds: selected }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        router.push(`/superpacks/${json.id}`);
      } else {
        const res = await fetch(`/api/superpacks/${superpackId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, description: description || null, datapackIds: selected }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Datapack 선택</CardTitle>
          <CardDescription>
            포함할 Datapack을 고르세요. 선택한 Datapack의 모든 Dataset이 Superpack에 들어갑니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Datapack 검색…"
              className="h-8 w-56"
              aria-label="Datapack 검색"
            />
            {allTags.length ? (
              <div className="flex flex-wrap items-center gap-1">
                {allTags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTagFilter(tagFilter === t ? null : t)}
                    className={`rounded-full border px-2 py-0.5 text-xs ${tagFilter === t ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <ul className="divide-y rounded-md border">
            {candidates.length === 0 ? (
              <li className="text-muted-foreground p-4 text-center text-sm">
                일치하는 Datapack이 없습니다.
              </li>
            ) : (
              candidates.map((d) => {
                const checked = selected.includes(d.id);
                return (
                  <li key={d.id}>
                    <Label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm font-normal">
                      <Checkbox checked={checked} onCheckedChange={() => toggle(d.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{d.name}</span>
                          {d.tags.map((t) => (
                            <TagChip key={t} name={t} />
                          ))}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          Dataset {d.nDatasets}개 · 샘플 {formatInt(d.nSamples)}
                          {d.superpacks.length ? ` · 소속: ${d.superpacks.join(", ")}` : ""}
                        </span>
                      </span>
                    </Label>
                  </li>
                );
              })
            )}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4 self-start">
        <Card>
          <CardHeader>
            <CardTitle>{mode === "create" ? "새 Superpack" : "Superpack 정보"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sp-name">이름</Label>
              <Input
                id="sp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: base+added+mmoth_v3"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sp-desc">설명 (선택)</Label>
              <Textarea
                id="sp-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div className="bg-muted/50 rounded-md p-2">
                <dt className="text-muted-foreground text-xs">Datapack</dt>
                <dd className="font-semibold tabular-nums">{selected.length}</dd>
              </div>
              <div className="bg-muted/50 rounded-md p-2">
                <dt className="text-muted-foreground text-xs">Dataset</dt>
                <dd className="font-semibold tabular-nums">{formatInt(totals.nDatasets)}</dd>
              </div>
              <div className="bg-muted/50 rounded-md p-2">
                <dt className="text-muted-foreground text-xs">샘플</dt>
                <dd className="font-semibold tabular-nums">{formatInt(totals.nSamples)}</dd>
              </div>
            </dl>
            <div>
              <p className="text-muted-foreground mb-1 text-xs">선택 순서</p>
              {selected.length === 0 ? (
                <p className="text-muted-foreground text-sm">선택된 Datapack이 없습니다.</p>
              ) : (
                <ol className="grid gap-1">
                  {selected.map((id, i) => {
                    const d = byId.get(id);
                    if (!d) return null;
                    return (
                      <li
                        key={id}
                        className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
                      >
                        <Badge
                          variant="secondary"
                          className="h-5 w-6 justify-center px-0 tabular-nums"
                        >
                          {i + 1}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate">{d.name}</span>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label="위로"
                          disabled={i === 0}
                          onClick={() => move(id, -1)}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label="아래로"
                          disabled={i === selected.length - 1}
                          onClick={() => move(id, 1)}
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label="제거"
                          onClick={() => toggle(id)}
                        >
                          <X />
                        </Button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <Button
              onClick={submit}
              disabled={busy || !dirty || !name.trim() || selected.length === 0}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Save />}
              {mode === "create" ? "Superpack 만들기" : "구성 저장"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
