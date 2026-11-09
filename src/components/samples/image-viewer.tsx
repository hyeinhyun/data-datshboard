"use client";

import { ExternalLink, ImageOff, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { imageUrl } from "@/lib/images/url";

type ImageViewerProps = { paths: string[] };

/** Shows a sample's image(s) with a zoom toggle and a link to the original file. */
export function ImageViewer({ paths }: ImageViewerProps) {
  const [zoom, setZoom] = useState(false);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  if (paths.length === 0) {
    return (
      <div className="bg-muted text-muted-foreground flex h-32 items-center justify-center rounded-md text-xs">
        <ImageOff className="mr-2 size-4" /> 이미지 없음 (텍스트 전용 샘플)
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      {paths.map((p) => (
        <figure key={p} className="grid gap-1">
          <div
            className={`bg-muted/40 relative overflow-auto rounded-md border ${zoom ? "max-h-[70vh]" : "max-h-80"}`}
          >
            {failed[p] ? (
              <div className="text-muted-foreground flex h-32 flex-col items-center justify-center gap-1 text-xs">
                <ImageOff className="size-4" />
                이미지 파일을 찾을 수 없습니다
                <code className="text-[10px]">{p}</code>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- served by our own image route
              <img
                src={imageUrl(p, zoom ? undefined : 1024)}
                alt={p}
                onError={() => setFailed((f) => ({ ...f, [p]: true }))}
                className={zoom ? "max-w-none" : "mx-auto max-h-80 object-contain"}
              />
            )}
          </div>
          <figcaption className="text-muted-foreground flex items-center justify-between gap-2 text-[11px]">
            <code className="truncate" title={p}>
              {p}
            </code>
            <span className="flex shrink-0 items-center gap-1">
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={zoom ? "축소" : "확대"}
                onClick={() => setZoom((z) => !z)}
              >
                {zoom ? <ZoomOut /> : <ZoomIn />}
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="원본 열기"
                nativeButton={false}
                render={<a href={imageUrl(p)} target="_blank" rel="noreferrer" />}
              >
                <ExternalLink />
              </Button>
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
