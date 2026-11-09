import type { Metadata } from "next";
import Link from "next/link";

import { SuperpackComposer } from "@/components/superpacks/superpack-composer";
import { getDb } from "@/lib/db/client";
import { listDatapacks } from "@/lib/queries/datapacks";

export const metadata: Metadata = { title: "새 Superpack" };
export const dynamic = "force-dynamic";

export default function NewSuperpackPage() {
  const datapacks = listDatapacks(getDb()).map((p) => ({
    id: p.id,
    name: p.name,
    nDatasets: p.nDatasets,
    nSamples: p.nSamples,
    tags: p.tags.map((t) => t.name),
    superpacks: p.superpacks.map((s) => s.name),
  }));
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs">
          <Link href="/superpacks" className="hover:underline">
            Superpack
          </Link>{" "}
          /
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">새 Superpack</h2>
        <p className="text-muted-foreground text-sm">
          Datapack을 조합해 새로운 학습 믹스를 만듭니다. MX weight는 기본 1로 시작하며 만든 뒤
          편집할 수 있습니다.
        </p>
      </div>
      <SuperpackComposer datapacks={datapacks} mode="create" />
    </div>
  );
}
