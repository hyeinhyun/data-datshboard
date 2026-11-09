import { describe, expect, it } from "vitest";

import { NAV_ITEMS, isNavItemActive } from "@/lib/nav";

describe("NAV_ITEMS", () => {
  it("has unique hrefs that all start with /", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(href.startsWith("/")).toBe(true);
  });
});

describe("isNavItemActive", () => {
  it("matches the overview only on the exact root path", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/", "/datasets")).toBe(false);
  });

  it("matches a section and its sub-routes", () => {
    expect(isNavItemActive("/datasets", "/datasets")).toBe(true);
    expect(isNavItemActive("/datasets", "/datasets/42")).toBe(true);
    expect(isNavItemActive("/datasets", "/datasets-archive")).toBe(false);
  });
});
