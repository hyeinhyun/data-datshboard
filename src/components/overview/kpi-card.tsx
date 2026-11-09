import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatInt } from "@/lib/format";

type KpiCardProps = {
  label: string;
  value: number;
  hint?: string;
  icon?: LucideIcon;
};

export function KpiCard({ label, value, hint, icon: Icon }: KpiCardProps) {
  return (
    <Card size="sm">
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground truncate text-xs font-medium">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
            {formatInt(value)}
          </p>
          {hint ? <p className="text-muted-foreground mt-1 truncate text-xs">{hint}</p> : null}
        </div>
        {Icon ? <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" /> : null}
      </CardContent>
    </Card>
  );
}
