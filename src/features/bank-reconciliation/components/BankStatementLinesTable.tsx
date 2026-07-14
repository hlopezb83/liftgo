import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay, cn } from "@/lib/utils";
import { BANK_LINE_STATUS_LABELS } from "../lib/bankReconciliationConstants";
import type { BankStatementLine } from "../hooks/useBankStatementLines";

interface Props {
  lines: BankStatementLine[];
  onSelect: (line: BankStatementLine) => void;
}

// Mapea el estado de la línea al tono semántico del StatusBadge global.
const LINE_STATUS_MAP: Record<string, string> = {
  unmatched: "draft",
  suggested: "pending",
  matched: "confirmed",
  ignored: "inactive",
};

export function BankStatementLinesTable({ lines, onSelect }: Props) {
  const columns: ColumnDef<BankStatementLine>[] = [
    {
      id: "posted_date",
      header: "Fecha",
      accessorKey: "posted_date",
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
      meta: { align: "right" },
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

  const table = useLiftgoTable<BankStatementLine>({
    data: lines,
    columns,
    getRowId: (l) => l.id,
    initialSorting: [{ id: "posted_date", desc: true }],
    paginated: false,
  });

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <DataTableV2
          table={table}
          onRowClick={onSelect}
          emptyMessage="Sin movimientos para esta cuenta. Sube un estado de cuenta arriba para comenzar."
        />
      </CardContent>
    </Card>
  );
}
