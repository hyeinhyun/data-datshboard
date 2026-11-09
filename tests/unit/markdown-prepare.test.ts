import { describe, expect, it } from "vitest";

import { prepare } from "@/components/samples/markdown-view";

describe("prepare (markdown pre-processing)", () => {
  it("wraps bare \\boxed{} in inline math and leaves existing math alone", () => {
    expect(prepare("Final: \\boxed{A}")).toBe("Final: $\\boxed{A}$");
    expect(prepare("\\boxed{\\text{line chart}} done")).toBe("$\\boxed{\\text{line chart}}$ done");
    expect(prepare("$\\boxed{6}$")).toBe("$\\boxed{6}$");
  });

  it("converts \\( \\) and \\[ \\] delimiters and image tokens", () => {
    expect(prepare("a \\(x^2\\) b")).toBe("a $x^2$ b");
    expect(prepare("\\[\\frac{1}{2}\\]")).toBe("$$\\frac{1}{2}$$");
    expect(prepare("<|image|>\nQ")).toBe("`[image]`\nQ");
  });
});
