import { useMemo } from "react";
import type { ColumnDef } from "@/components/dataTable/v2";
import { DeleteIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateDisplay } from "@/lib/utils";
import type { useBankStatementImports } from "../hooks/useBankStatementImports";

export type ImportRow = NonNullable<ReturnType<typeof useBankStatementImports>["data"]>[number];

export function useBankImportsColumns(
  canDelete: boolean,
  onDeleteRequest: (id: string) => void,
): ColumnDef<ImportRow>[] {
  return useMemo(() => {
    const base: ColumnDef<ImportRow>[] = [
      {
        id: "created_at",
        header: "Fecha import",
        accessorKey: "created_at",
        cell: ({ row }) => (
          <span className="text-xs">{formatDateDisplay(row.original.created_at)}</span>
        ),
      },
      {
        id: "bank_account_name",
        header: "Cuenta",
        accessorKey: "bank_account_name",
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.bank_account_name}
            {row.original.bank_account_last4 && (
              <span className="text-muted-foreground"> ····{row.original.bank_account_last4}</span>
            )}
          </span>
        ),
      },
      {
        id: "file_name",
        header: "Archivo",
        accessorKey: "file_name",
        cell: ({ row }) => (
          <span className="text-xs font-mono truncate max-w-[200px] inline-block align-middle">
            {row.original.file_name}
          </span>
        ),
      },
      {
        id: "period",
        header: "Periodo",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.period_start && row.original.period_end
              ? `${formatDateDisplay(row.original.period_start)} → ${formatDateDisplay(row.original.period_end)}`
              : "—"}
          </span>
        ),
      },
      {
        id: "total_count",
        header: "Líneas",
        accessorKey: "total_count",
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.total_count}</span>
        ),
      },
      {
        id: "matched_count",
        header: "Conciliadas",
        accessorKey: "matched_count",
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.matched_count}</span>
        ),
      },
      {
        id: "pct",
        header: "% Concil.",
        meta: { align: "right" },
        accessorFn: (i) =>
          i.total_count > 0 ? (i.matched_count / i.total_count) * 100 : 0,
        cell: ({ row }) => {
          const i = row.original;
          const pct =
            i.total_count > 0 ? Math.round((i.matched_count / i.total_count) * 100) : 0;
          return (
            <Badge
              variant={pct === 100 ? "default" : pct >= 50 ? "secondary" : "outline"}
              className="text-3xs"
            >
              {pct}%
            </Badge>
          );
        },
      },
    ];
    if (canDelete) {
      base.push({
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { align: "right", cellClassName: "w-12" },
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteRequest(row.original.id);
            }}
            aria-label="Eliminar import"
          >
            <DeleteIcon className="h-3.5 w-3.5" />
          </Button>
        ),
      });
    }
    return base;
  }, [canDelete, onDeleteRequest]);
}
