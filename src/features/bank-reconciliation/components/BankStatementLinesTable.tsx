import { useState } from "react";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay, cn } from "@/lib/utils";
import { useConfirmBankMatches, useIgnoreBankLines } from "../hooks/mutations/useBankBulkActions";
import { BANK_LINE_STATUS_LABELS } from "../lib/bankReconciliationConstants";
import type { BankStatementLine } from "../hooks/useBankStatementLines";

interface Props {
  lines: BankStatementLine[];
  bankAccountId: string;
  isLoading?: boolean;
  activeId?: string | null;
  onSelect: (line: BankStatementLine) => void;
}

// Mapea el estado de la línea al tono semántico del StatusBadge global.
const LINE_STATUS_MAP: Record<string, string> = {
  unmatched: "draft",
  suggested: "pending",
  matched: "confirmed",
  ignored: "inactive",
};

const columns: ColumnDef<BankStatementLine>[] = [
  {
    id: "posted_date",
    header: "Fecha",
    accessorKey: "posted_date",
    meta: { kind: "date" },
    cell: ({ row }) => (
      <span className="whitespace-nowrap">{formatDateDisplay(row.original.posted_date)}</span>
    ),
  },
  {
    id: "description",
    header: "Descripción",
    accessorKey: "description",
    cell: ({ row }) => (
      <span className="block max-w-md truncate">{row.original.description || "—"}</span>
    ),
  },
  {
    id: "reference",
    header: "Referencia",
    accessorKey: "reference",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.reference ?? "—"}</span>
    ),
  },
  {
    id: "signed_amount",
    header: "Importe",
    accessorKey: "signed_amount",
    meta: { align: "right", kind: "money" },
    cell: ({ row }) => (
      <span
        className={cn(
          "font-mono tabular-nums",
          row.original.signed_amount < 0 ? "text-destructive" : "text-success",
        )}
      >
        {formatCurrency(row.original.signed_amount)}
      </span>
    ),
  },
  {
    id: "status",
    header: "Estado",
    accessorKey: "status",
    cell: ({ row }) => (
      <StatusBadge
        status={LINE_STATUS_MAP[row.original.status] ?? "draft"}
        label={BANK_LINE_STATUS_LABELS[row.original.status]}
      />
    ),
  },
];

export function BankStatementLinesTable({
  lines,
  bankAccountId,
  isLoading,
  activeId,
  onSelect,
}: Props) {
  const [bulkReason, setBulkReason] = useState("");
  const confirmManyMut = useConfirmBankMatches();
  const ignoreManyMut = useIgnoreBankLines();

  const table = useLiftgoTable<BankStatementLine>({
    data: lines,
    columns,
    getRowId: (l) => l.id,
    initialSorting: [{ id: "posted_date", desc: true }],
    paginated: false,
    enableRowSelection: (l) => l.status === "unmatched" || l.status === "suggested",
  });

  return (
    <Card data-testid="bank-lines-table">
      <CardContent className="overflow-x-auto p-0">
        <DataTableV2
          table={table}
          isLoading={isLoading}
          onRowClick={onSelect}
          enableRowSelection
          rowClassName={(l) => (l.id === activeId ? "bg-accent/60" : undefined)}
          selectionToolbar={({ selectedIds, selectedRows, clearSelection }) => {
            const suggested = selectedRows.filter((l) => l.status === "suggested");
            return (
              <div
                className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs"
                data-testid="bank-bulk-toolbar"
              >
                <span className="font-medium" data-testid="bank-bulk-count">
                  {selectedIds.length} seleccionados
                </span>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={suggested.length === 0 || confirmManyMut.isPending}
                  onClick={() =>
                    confirmManyMut.mutate(
                      { lineIds: suggested.map((l) => l.id), bankAccountId },
                      { onSuccess: clearSelection },
                    )
                  }
                >
                  Confirmar sugeridos ({suggested.length})
                </Button>
                <Input
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  data-testid="bank-bulk-reason"
                  placeholder="Razón para ignorar…"
                  className="h-7 w-52 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!bulkReason.trim() || ignoreManyMut.isPending}
                  onClick={() =>
                    ignoreManyMut.mutate(
                      { lineIds: selectedIds, bankAccountId, reason: bulkReason.trim() },
                      {
                        onSuccess: () => {
                          setBulkReason("");
                          clearSelection();
                        },
                      },
                    )
                  }
                  data-testid="bank-bulk-ignore"
                >
                  Ignorar seleccionados
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearSelection}>
                  Limpiar
                </Button>
              </div>
            );
          }}
          emptyMessage="Sin movimientos con estos filtros. Sube un estado de cuenta para comenzar."
        />
      </CardContent>
    </Card>
  );
}
