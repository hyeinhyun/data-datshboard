"use client";

import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Download } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { TagChip } from "@/components/tags/tag-chip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatInt, formatWeight } from "@/lib/format";
import { variantSamples, type DatasetRow } from "@/lib/domain";

type DatasetsTableProps = { rows: DatasetRow[]; showWeights: boolean };

function variantCount(d: DatasetRow, kind: string): number | null {
  const v = d.variants.find((x) => x.kind === kind);
  return v ? (v.nSamples ?? 0) : null;
}

function indexedCount(d: DatasetRow): number {
  return d.variants.reduce((n, v) => n + (v.nIndexed ?? 0), 0);
}

export function DatasetsTable({ rows, showWeights }: DatasetsTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([{ id: "total", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    subCategory: false,
    language: false,
  });

  const columns = useMemo<ColumnDef<DatasetRow>[]>(() => {
    const num = (id: string, header: string, value: (d: DatasetRow) => number | null) =>
      ({
        id,
        header,
        accessorFn: (d) => value(d) ?? -1,
        cell: ({ row }) => {
          const v = value(row.original);
          return (
            <span className="block text-right tabular-nums">
              {v === null ? <span className="text-muted-foreground">–</span> : formatInt(v)}
            </span>
          );
        },
        meta: { align: "right" },
      }) satisfies ColumnDef<DatasetRow>;
    const cols: ColumnDef<DatasetRow>[] = [
      { id: "datapack", header: "Datapack", accessorKey: "datapack" },
      {
        id: "name",
        header: "Dataset",
        accessorKey: "name",
        cell: ({ getValue }) => <span className="font-medium">{String(getValue())}</span>,
      },
      { id: "category", header: "Category", accessorFn: (d) => d.category ?? "" },
      { id: "subCategory", header: "Sub-category", accessorFn: (d) => d.subCategory ?? "" },
      { id: "language", header: "언어", accessorFn: (d) => d.language ?? "" },
      num("longer", "longer", (d) => variantCount(d, "longer")),
      num("longans", "longans", (d) => variantCount(d, "longans")),
      num("shortans", "shortans", (d) => variantCount(d, "shortans")),
      num("total", "합계", (d) => variantSamples(d)),
    ];
    if (showWeights) {
      cols.push(
        {
          id: "mx1",
          header: "MX (1)",
          accessorFn: (d) => d.mxWeight1 ?? -1,
          cell: ({ row }) => (
            <span className="block text-right tabular-nums">
              {formatWeight(row.original.mxWeight1)}
            </span>
          ),
          meta: { align: "right" },
        },
        {
          id: "mx2",
          header: "MX (2)",
          accessorFn: (d) => d.mxWeight2 ?? -1,
          cell: ({ row }) => (
            <span className="block text-right tabular-nums">
              {formatWeight(row.original.mxWeight2)}
            </span>
          ),
          meta: { align: "right" },
        },
      );
    }
    cols.push(
      num("indexed", "색인", (d) => indexedCount(d)),
      {
        id: "tags",
        header: "태그",
        accessorFn: (d) => d.tags.join(" "),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.tags.map((t) => (
              <TagChip key={t} name={t} />
            ))}
          </div>
        ),
      },
    );
    return cols;
  }, [showWeights]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table v8 is not compiler-memoizable by design
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: "includesString",
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const tableRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 41,
    overscan: 12,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length
    ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;

  function exportCsv() {
    const visible = table.getVisibleLeafColumns();
    const header = visible.map((c) => String(c.columnDef.header ?? c.id));
    const lines = tableRows.map((r) =>
      visible
        .map((c) => {
          const d = r.original;
          switch (c.id) {
            case "tags":
              return d.tags.join("|");
            case "total":
              return String(variantSamples(d));
            case "indexed":
              return String(indexedCount(d));
            case "mx1":
              return d.mxWeight1 ?? "";
            case "mx2":
              return d.mxWeight2 ?? "";
            case "longer":
            case "longans":
            case "shortans":
              return variantCount(d, c.id) ?? "";
            default:
              return String(r.getValue(c.id) ?? "");
          }
        })
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "datasets.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="이름, 카테고리, 태그 검색…"
          className="h-8 w-64"
          aria-label="테이블 검색"
        />
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatInt(tableRows.length)} / {formatInt(rows.length)} 행
        </span>
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <Columns3 /> 컬럼
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>표시할 컬럼</DropdownMenuLabel>
                {table
                  .getAllLeafColumns()
                  .filter((c) => c.id !== "name")
                  .map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={c.getIsVisible()}
                      onCheckedChange={(v) => c.toggleVisibility(Boolean(v))}
                      closeOnClick={false}
                    >
                      {String(c.columnDef.header ?? c.id)}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={tableRows.length === 0}>
            <Download /> CSV
          </Button>
        </div>
      </div>

      <div ref={parentRef} className="relative max-h-[70vh] overflow-auto rounded-md border">
        <table className="w-full caption-bottom text-sm">
          <thead className="bg-card sticky top-0 z-10 shadow-[inset_0_-1px_0_var(--border)]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const align = (h.column.columnDef.meta as { align?: string } | undefined)?.align;
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      className={`text-muted-foreground h-10 px-3 text-xs font-medium whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}
                    >
                      {h.column.getCanSort() ? (
                        <button
                          type="button"
                          className="hover:text-foreground inline-flex items-center gap-1"
                          onClick={h.column.getToggleSortingHandler()}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ArrowUpDown className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 ? (
              <tr>
                <td style={{ height: paddingTop }} />
              </tr>
            ) : null}
            {virtualItems.map((vi) => {
              const row = tableRows[vi.index];
              return (
                <tr
                  key={row.id}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  className="hover:bg-muted/50 cursor-pointer border-b"
                  onClick={() => router.push(`/datasets/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="max-w-72 truncate px-3 py-2 align-middle whitespace-nowrap"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            {paddingBottom > 0 ? (
              <tr>
                <td style={{ height: paddingBottom }} />
              </tr>
            ) : null}
            {tableRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-muted-foreground py-8 text-center text-sm"
                >
                  표시할 Dataset이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
