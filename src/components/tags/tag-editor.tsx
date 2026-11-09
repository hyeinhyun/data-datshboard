"use client";

import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { useId, useState } from "react";

import { TagChip } from "@/components/tags/tag-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Tag, TagTarget } from "@/lib/queries/tags";

type TagEditorProps = {
  targetType: TagTarget;
  targetId: number;
  tags: Tag[];
  /** Tags inherited from the parent datapack (shown, not editable here). */
  inherited?: Tag[];
  /** Existing tag names for autocompletion. */
  suggestions: string[];
};

export function TagEditor({
  targetType,
  targetId,
  tags,
  inherited = [],
  suggestions,
}: TagEditorProps) {
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "POST" | "DELETE", tag: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/taggings", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tag, targetType, targetId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setValue("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const own = new Set(tags.map((t) => t.name));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <TagChip
            key={t.id}
            name={t.name}
            color={t.color}
            onRemove={() => call("DELETE", t.name)}
          />
        ))}
        {inherited
          .filter((t) => !own.has(t.name))
          .map((t) => (
            <TagChip
              key={`inh-${t.id}`}
              name={t.name}
              color={t.color}
              muted
              title="Datapack에서 상속된 태그"
            />
          ))}
        {tags.length === 0 && inherited.length === 0 ? (
          <span className="text-muted-foreground text-xs">태그 없음</span>
        ) : null}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) void call("POST", value);
        }}
      >
        <Input
          list={listId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="태그 추가 (예: filtered)"
          className="h-8 w-56"
          disabled={busy}
          aria-label="태그 이름"
        />
        <datalist id={listId}>
          {suggestions
            .filter((s) => !own.has(s))
            .map((s) => (
              <option key={s} value={s} />
            ))}
        </datalist>
        <Button type="submit" size="sm" variant="outline" disabled={busy || !value.trim()}>
          {busy ? <Loader2 className="animate-spin" /> : <Plus />} 추가
        </Button>
      </form>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
