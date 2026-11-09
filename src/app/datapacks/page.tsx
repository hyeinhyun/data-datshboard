import type { Metadata } from "next";
import Link from "next/link";

import { TagChip } from "@/components/tags/tag-chip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/lib/db/client";
import { formatInt } from "@/lib/format";
import { listDatapacks } from "@/lib/queries/datapacks";

export const metadata: Metadata = { title: "Datapack" };
export const dynamic = "force-dynamic";

export default function DatapacksPage() {
  const datapacks = listDatapacks(getDb());
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">Datapack</h2>
        <p className="text-muted-foreground text-sm">
          Dataset의 묶음입니다. 각 Datapack이 어느 Superpack에 포함되는지와 태그를 표시합니다.
        </p>
      </div>
      <Card>
        <CardContent>
          {datapacks.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              아직 Datapack이 없습니다.{" "}
              <Link href="/import" className="underline">
                Manifest를 가져오세요.
              </Link>
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datapack</TableHead>
                  <TableHead className="text-right">Dataset</TableHead>
                  <TableHead className="text-right">샘플</TableHead>
                  <TableHead>소속 Superpack</TableHead>
                  <TableHead>태그</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datapacks.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link href={`/datapacks/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                      {p.description ? (
                        <p className="text-muted-foreground text-xs">{p.description}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatInt(p.nDatasets)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatInt(p.nSamples)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.superpacks.length === 0 ? (
                          <span className="text-muted-foreground text-xs">없음</span>
                        ) : (
                          p.superpacks.map((s) => (
                            <Badge
                              key={s.id}
                              variant={s.source === "user" ? "default" : "secondary"}
                              render={<Link href={`/superpacks/${s.id}`} />}
                            >
                              {s.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.tags.map((t) => (
                          <TagChip key={t.id} name={t.name} color={t.color} />
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
