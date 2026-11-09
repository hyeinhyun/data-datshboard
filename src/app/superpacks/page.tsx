import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatDate, formatInt } from "@/lib/format";
import { listSuperpacks } from "@/lib/queries/overview";

export const metadata: Metadata = { title: "Superpack" };
export const dynamic = "force-dynamic";

export default function SuperpacksPage() {
  const superpacks = listSuperpacks(getDb());
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">Superpack</h2>
          <p className="text-muted-foreground text-sm">
            학습 데이터 믹스 하나. Excel 탭에서 가져오거나 Datapack을 골라 직접 구성합니다.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/superpacks/new" />}>
          <Plus /> 새 Superpack
        </Button>
      </div>
      <Card>
        <CardContent>
          {superpacks.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              아직 Superpack이 없습니다. Manifest를 가져오거나 새로 만드세요.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>출처</TableHead>
                  <TableHead className="text-right">Datapack</TableHead>
                  <TableHead className="text-right">Dataset</TableHead>
                  <TableHead className="text-right">샘플</TableHead>
                  <TableHead>갱신</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {superpacks.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <Link href={`/superpacks/${s.id}`} className="hover:underline">
                        {s.name}
                      </Link>
                      {s.description ? (
                        <p className="text-muted-foreground text-xs">{s.description}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.source === "user" ? "default" : "secondary"}>
                        {s.source === "user" ? "직접 구성" : "Excel"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.nDatapacks}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatInt(s.nDatasets)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatInt(s.nSamples)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      {formatDate(s.updatedAt)}
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
