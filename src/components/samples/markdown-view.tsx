"use client";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

type MarkdownViewProps = { text: string; className?: string };

/**
 * Normalises answer text before markdown parsing:
 *  - image placeholder tokens become a visible chip
 *  - `\(...\)` / `\[...\]` delimiters become `$...$` / `$$...$$`
 *  - bare `\boxed{...}` (common in these answers, with no `$` around it) is wrapped in `$...$`
 */
export function prepare(text: string): string {
  let out = text.replace(/<\|image\|>|<image>/g, "`[image]`");
  out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_, inner: string) => `$$${inner}$$`);
  out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_, inner: string) => `$${inner}$`);
  return wrapBareBoxed(out);
}

const BOXED = "\\boxed";

function wrapBareBoxed(text: string): string {
  let result = "";
  let i = 0;
  let inMath = false;
  while (i < text.length) {
    if (text[i] === "$") {
      inMath = !inMath;
      result += text[i++];
      continue;
    }
    if (!inMath && text.startsWith(`${BOXED}{`, i)) {
      // Find the matching closing brace of \boxed{...}.
      let depth = 0;
      let j = i + BOXED.length;
      for (; j < text.length; j++) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      if (j < text.length) {
        result += `$${text.slice(i, j + 1)}$`;
        i = j + 1;
        continue;
      }
    }
    result += text[i++];
  }
  return result;
}

/** Markdown + GFM + KaTeX + code highlighting, scoped by the `.md` class. */
export function MarkdownView({ text, className }: MarkdownViewProps) {
  return (
    <div className={`md ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: false }]]}
      >
        {prepare(text)}
      </ReactMarkdown>
    </div>
  );
}
