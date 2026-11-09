import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const COLOR_VAR: Record<string, string> = {
  blue: "var(--series-1)",
  orange: "var(--series-2)",
  aqua: "var(--series-3)",
  yellow: "var(--series-4)",
  magenta: "var(--series-5)",
  green: "var(--series-6)",
};

type TagChipProps = {
  name: string;
  color?: string | null;
  muted?: boolean;
  onRemove?: () => void;
  title?: string;
};

/** A tag badge: a colored dot carries identity, the text stays in text tokens. */
export function TagChip({ name, color, muted, onRemove, title }: TagChipProps) {
  return (
    <Badge
      variant="outline"
      className={muted ? "text-muted-foreground gap-1 pr-1" : "gap-1 pr-1"}
      title={title}
    >
      <span
        aria-hidden
        className="inline-block size-2 rounded-full"
        style={{ background: COLOR_VAR[color ?? ""] ?? "var(--muted-foreground)" }}
      />
      {name}
      {onRemove ? (
        <button
          type="button"
          aria-label={`${name} 태그 제거`}
          className="hover:bg-muted-foreground/20 ml-0.5 rounded-sm"
          onClick={onRemove}
        >
          <X className="size-3" />
        </button>
      ) : (
        <span className="w-0.5" />
      )}
    </Badge>
  );
}
