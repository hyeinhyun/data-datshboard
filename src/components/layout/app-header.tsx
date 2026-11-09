"use client";

import { usePathname } from "next/navigation";

import { GlobalSearch } from "@/components/search/global-search";
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
        <GlobalSearch />
      </div>
    </header>
  );
}
