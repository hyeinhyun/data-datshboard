"use client";

import { useRouter } from "next/navigation";
import { Copy, Download, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SuperpackActionsProps = { id: number; name: string; source: "excel" | "user" };

export function SuperpackActions({ id, name, source }: SuperpackActionsProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"duplicate" | "delete" | null>(null);
  const [newName, setNewName] = useState(`${name}_copy`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function duplicate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/superpacks/${id}/duplicate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setDialog(null);
      router.push(`/superpacks/${json.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/superpacks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDialog(null);
      router.push("/superpacks");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
          <Download /> 내보내기
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<a href={`/api/superpacks/${id}/export?format=xlsx`} />}>
            Excel (Manifest 형식)
          </DropdownMenuItem>
          <DropdownMenuItem render={<a href={`/api/superpacks/${id}/export?format=json`} />}>
            JSON (학습 스크립트용)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="sm" onClick={() => setDialog("duplicate")}>
        <Copy /> 복제
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive"
        onClick={() => setDialog("delete")}
      >
        <Trash2 /> 삭제
      </Button>

      <Dialog open={dialog === "duplicate"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Superpack 복제</DialogTitle>
            <DialogDescription>
              Datapack 구성과 가중치를 그대로 복사한 새 Superpack을 만듭니다. 복제본은 자유롭게
              편집할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="dup-name">새 이름</Label>
            <Input id="dup-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              취소
            </Button>
            <Button onClick={duplicate} disabled={busy || !newName.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <Copy />} 복제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Superpack 삭제</DialogTitle>
            <DialogDescription>
              &quot;{name}&quot;의 Datapack 구성과 가중치가 삭제됩니다. Datapack과 Dataset 자체는
              남습니다.
              {source === "excel" ? " Excel을 다시 가져오면 복원됩니다." : " 되돌릴 수 없습니다."}
            </DialogDescription>
          </DialogHeader>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              취소
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} 삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
