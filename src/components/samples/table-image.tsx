"use client";

import { ImageOff } from "lucide-react";
import { useCallback, useState } from "react";

import { imageUrl } from "@/lib/images/url";

/**
 * Thumbnail for the table view that turns into a labelled placeholder when the file
 * cannot be served (missing, or outside IMAGE_ROOT, e.g. a config with another media_dir).
 */
export function TableImage({ path, wide }: { path: string; wide: boolean }) {
  const [failed, setFailed] = useState(false);
  // A 404 can arrive before hydration attaches onError; catch that case on mount.
  const ref = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  const width = wide ? "w-full" : "w-[calc(50%-2px)]";
  if (failed) {
    return (
      <div
        className={`bg-muted text-muted-foreground flex min-h-20 flex-col items-center justify-center gap-1 rounded p-1 text-center ${width}`}
        title={path}
      >
        <ImageOff className="size-4" />
        <span className="text-[10px]">이미지 없음</span>
        <span className="line-clamp-2 font-mono text-[9px] break-all">{path}</span>
      </div>
    );
  }
  return (
    <a href={imageUrl(path)} target="_blank" rel="noreferrer" title={path} className={width}>
      {/* eslint-disable-next-line @next/next/no-img-element -- served by our own thumbnail route */}
      <img
        ref={ref}
        src={imageUrl(path, 256)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="bg-muted max-h-48 w-full rounded object-contain"
      />
    </a>
  );
}
