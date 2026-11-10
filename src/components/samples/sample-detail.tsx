"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Code2, Copy, FileText, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ConversationView } from "@/components/samples/conversation-view";
import { ImageViewer } from "@/components/samples/image-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { VARIANT_COLOR } from "@/lib/charts/palette";
import { formatInt } from "@/lib/format";
import type { SampleDetail as SampleDetailData } from "@/lib/queries/samples";

type SampleDetailProps = {
  sample: SampleDetailData;
  prevHref: string | null;
  nextHref: string | null;
  closeHref: string;
  position: number;
  total: number;
  /** Links that open the same sample id in the dataset's other variants. */
  siblingLinks: { kind: string; href: string }[];
};

export function SampleDetailSheet({
  sample,
  prevHref,
  nextHref,
  closeHref,
  position,
  total,
  siblingLinks,
}: SampleDetailProps) {
  const router = useRouter();
  const [raw, setRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft" && prevHref) router.push(prevHref, { scroll: false });
      if (e.key === "ArrowRight" && nextHref) router.push(nextHref, { scroll: false });
    };
    // Capture phase: the dialog focus manager must not swallow arrow keys before we see them.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [prevHref, nextHref, router]);

  async function copyJson() {
    const payload = {
      id: sample.sampleId,
      image: sample.imagePaths.length === 1 ? sample.imagePaths[0] : sample.imagePaths,
      conversations: sample.conversations,
      ...(sample.meta ? { meta: sample.meta } : {}),
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Sheet open onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl"
        showCloseButton={false}
      >
        <SheetHeader className="border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="이전 샘플 (←)"
              disabled={!prevHref}
              nativeButton={!prevHref}
              render={prevHref ? <Link href={prevHref} scroll={false} /> : undefined}
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="다음 샘플 (→)"
              disabled={!nextHref}
              nativeButton={!nextHref}
              render={nextHref ? <Link href={nextHref} scroll={false} /> : undefined}
            >
              <ChevronRight />
            </Button>
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatInt(position)} / {formatInt(total)}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                size="sm"
                variant={raw ? "secondary" : "ghost"}
                onClick={() => setRaw((r) => !r)}
              >
                {raw ? <FileText /> : <Code2 />} {raw ? "렌더링" : "원문"}
              </Button>
              <Button size="sm" variant="ghost" onClick={copyJson}>
                {copied ? <Check /> : <Copy />} JSON
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="닫기"
                nativeButton={false}
                render={<Link href={closeHref} scroll={false} />}
              >
                <X />
              </Button>
            </div>
          </div>
          <SheetTitle className="mt-2 flex flex-wrap items-center gap-1.5 text-base">
            <code className="font-mono text-sm">{sample.sampleId ?? `#${sample.id}`}</code>
            <Badge variant="outline" className="gap-1">
              <span
                className="inline-block size-2 rounded-full"
                style={{ background: VARIANT_COLOR[sample.kind] }}
              />
              {sample.kind}
            </Badge>
            <Badge variant="secondary" render={<Link href={`/datasets/${sample.datasetId}`} />}>
              {sample.datapack} / {sample.dataset}
            </Badge>
          </SheetTitle>
          <SheetDescription className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            <span>{sample.nTurns}턴</span>
            <span>질문 {formatInt(sample.qChars)}자</span>
            <span>답변 {formatInt(sample.aChars)}자</span>
            <span>이미지 {sample.nImages}장</span>
            {siblingLinks.length ? (
              <span className="flex items-center gap-1">
                다른 variant:
                {siblingLinks.map((s) => (
                  <Link key={s.href} href={s.href} scroll={false} className="underline">
                    {s.kind}
                  </Link>
                ))}
              </span>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="grid gap-4">
            <ImageViewer paths={sample.imagePaths} />
            {sample.loadError || sample.stale ? (
              <p className="border-destructive/40 text-destructive rounded-md border px-3 py-2 text-sm">
                {sample.loadError ??
                  "색인 후 원본 파일이 바뀌었습니다. 다른 샘플이 보일 수 있으니 다시 색인하세요."}
              </p>
            ) : null}
            <ConversationView turns={sample.conversations} raw={raw} />
            {sample.meta && Object.keys(sample.meta).length ? (
              <>
                <Separator />
                <section>
                  <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                    메타데이터
                  </h4>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                    {Object.entries(sample.meta).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-muted-foreground font-mono">{k}</dt>
                        <dd className="break-all">
                          {typeof v === "string" ? v : JSON.stringify(v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              </>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
