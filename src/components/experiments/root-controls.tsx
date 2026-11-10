"use client";

import { useRouter } from "next/navigation";
import { FolderSearch, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function call(url: string, init: RequestInit): Promise<void> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
}

/** Path input that registers a root directory and queues its scan. */
export function RootForm() {
  const router = useRouter();
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setQueued(null);
    try {
      await call("/api/experiments/roots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path }),
      });
      setQueued(path.trim());
      setPath("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/group-volume/home/.../scripts/training"
          className="font-mono text-sm"
          aria-label="실험 루트 디렉터리"
        />
        <Button type="submit" disabled={busy || !path.trim()}>
          {busy ? <Loader2 className="animate-spin" /> : <FolderSearch />}
          스캔
        </Button>
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {queued ? (
        <p className="text-muted-foreground text-sm">
          스캔을 시작했습니다. 끝나면 이 화면이 자동으로 갱신됩니다.
        </p>
      ) : null}
    </form>
  );
}

/** Rescan / forget buttons for one root. */
export function RootActions({ rootId, path }: { rootId: number; path: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"scan" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "scan" | "delete") {
    if (
      kind === "delete" &&
      !window.confirm(
        `${path}\n\n이 루트와 실험 목록을 지웁니다. 등록된 데이터 파일과 색인은 남습니다. 계속할까요?`,
      )
    )
      return;
    setBusy(kind);
    setError(null);
    try {
      await call(`/api/experiments/roots/${rootId}`, {
        method: kind === "scan" ? "POST" : "DELETE",
      });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button size="sm" variant="outline" onClick={() => run("scan")} disabled={busy !== null}>
        {busy === "scan" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        다시 스캔
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => run("delete")}
        disabled={busy !== null}
        aria-label="루트 삭제"
      >
        {busy === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </span>
  );
}
