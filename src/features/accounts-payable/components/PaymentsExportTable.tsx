import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { InfoAlertIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { cn, formatDateDisplay } from "@/lib/utils";
import type { ExportablePayable } from "../hooks/useExportablePayables";

interface RowState {
  selected: boolean;
  amount: number;
}

interface Props {
  bills: ExportablePayable[] | undefined;
  isLoading: boolean;
  rowState: Record<string, RowState>;
  allEligibleSelected: boolean;
  onToggleAll: (val: boolean) => void;
  onToggleRow: (id: string, selected: boolean, fallback: number) => void;
  onChangeAmount: (id: string, amount: number) => void;
}

export function PaymentsExportTable({
  bills,
  isLoading,
  rowState,
  allEligibleSelected,
  onToggleAll,
  onToggleRow,
  onChangeAmount,
}: Props) {
  const columns: ColumnDef<ExportablePayable>[] = [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={allEligibleSelected}
          onCheckedChange={(v) => onToggleAll(Boolean(v))}
          aria-label="Seleccionar todas"
        />
      ),
      enableSorting: false,
      cell: ({ row }) => (
        <Checkbox
          checked={rowState[row.original.id]?.selected ?? false}
          disabled={!row.original.has_valid_clabe}
          onCheckedChange={(v) => onToggleRow(row.original.id, Boolean(v), row.original.balance)}
        />
      ),
    },
    {
      id: "supplier_name",
      header: "Proveedor",
      accessorKey: "supplier_name",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.supplier_name}</div>
          <div className="text-xs text-muted-foreground font-mono">
            {row.original.supplier_rfc ?? "—"}
          </div>
        </div>
      ),
    },
    {
      id: "bank",
      header: "Banco / CLABE",
      enableSorting: false,
      cell: ({ row }) =>
        row.original.has_valid_clabe ? (
          <>
            <div className="text-xs">{row.original.bank_name}</div>
            <div className="text-xs font-mono text-muted-foreground">{row.original.clabe}</div>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-destructive text-xs">
            <InfoAlertIcon className="h-3.5 w-3.5" /> Sin CLABE válida
          </span>
        ),
    },
    {
      id: "bill_number",
      header: "Folio",
      accessorKey: "bill_number",
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.bill_number}
          {row.original.payment_in_progress_at && (
            <Badge variant="outline" className="ml-1 text-[10px]">
              en proceso
            </Badge>
          )}
        </span>
      ),
    },
    {
      id: "due_date",
      header: "Vence",
      accessorKey: "due_date",
      cell: ({ row }) => (
        <span className="text-xs">{formatDateDisplay(row.original.due_date)}</span>
      ),
    },
    {
      id: "balance",
      header: "Saldo",
      accessorKey: "balance",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="font-mono">{formatCurrency(row.original.balance)}</span>
      ),
    },
    {
      id: "amount",
      header: "A pagar",
      enableSorting: false,
      meta: { align: "right" },
      cell: ({ row }) => {
        const st = rowState[row.original.id];
        return (
          <Input
            type="number"
            step="0.01"
            min={0.01}
            max={row.original.balance}
            disabled={!row.original.has_valid_clabe || !st?.selected}
            value={st?.amount ?? row.original.balance}
            onChange={(e) => onChangeAmount(row.original.id, Number(e.target.value))}
            className="h-7 w-28 ml-auto text-right font-mono text-xs"
          />
        );
      },
    },
  ];

  const table = useLiftgoTable<ExportablePayable>({
    data: bills,
    columns,
    getRowId: (b) => b.id,
    paginated: false,
  });

  return (
    <DataTableV2
      table={table}
      isLoading={isLoading}
      emptyMessage="No hay facturas aprobadas pendientes de pago."
      rowClassName={(b) => cn(!b.has_valid_clabe && "opacity-80")}
    />
  );
}
