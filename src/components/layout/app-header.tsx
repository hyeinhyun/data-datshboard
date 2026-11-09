"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NAV_ITEMS, isNavItemActive } from "@/lib/nav";

export function AppHeader() {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => isNavItemActive(item.href, pathname));

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <h1 className="text-sm font-medium">{current?.title ?? "SFT Data Dashboard"}</h1>
      <div className="ml-auto">
        {/* Global search (⌘K command palette) lands in Phase 2. */}
        <Button variant="outline" size="sm" disabled className="w-56 justify-start gap-2">
          <Search className="size-4" />
          <span className="text-muted-foreground">검색…</span>
          <kbd className="bg-muted text-muted-foreground ml-auto rounded border px-1.5 font-mono text-[10px]">
            ⌘K
          </kbd>
        </Button>
      </div>
    </header>
  );
}
