"use client";

import { Bot, Settings2, User } from "lucide-react";

import { MarkdownView } from "@/components/samples/markdown-view";
import type { Turn } from "@/lib/indexer/derive";

type ConversationViewProps = { turns: Turn[]; raw: boolean };

function role(from: string): "system" | "human" | "gpt" | "other" {
  const f = from.toLowerCase();
  if (f === "system") return "system";
  if (f === "human" || f === "user") return "human";
  if (f === "gpt" || f === "assistant" || f === "model") return "gpt";
  return "other";
}

/** system / human / gpt turns as bubbles; markdown + KaTeX unless `raw`. */
export function ConversationView({ turns, raw }: ConversationViewProps) {
  return (
    <ol className="grid gap-3">
      {turns.map((t, i) => {
        const r = role(t.from);
        const Icon = r === "system" ? Settings2 : r === "human" ? User : Bot;
        const label =
          r === "system" ? "system" : r === "human" ? "human" : r === "gpt" ? "gpt" : t.from;
        const tone =
          r === "system"
            ? "bg-muted/60 border-dashed"
            : r === "human"
              ? "bg-[color-mix(in_oklch,var(--series-1),transparent_92%)] border-[color-mix(in_oklch,var(--series-1),transparent_70%)]"
              : "bg-card";
        return (
          <li key={i} className={`rounded-lg border p-3 ${tone}`}>
            <p className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase">
              <Icon className="size-3.5" /> {label}
              <span className="ml-auto font-normal normal-case tabular-nums">
                {t.value.length.toLocaleString("ko-KR")}자
              </span>
            </p>
            {raw ? (
              <pre className="font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
                {t.value}
              </pre>
            ) : (
              <MarkdownView text={t.value} className="text-sm" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
