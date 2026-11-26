import { useId } from "react";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { InfoAlertIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { isFxMissing } from "@/features/cash-flow";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { cn } from "@/lib/utils";
import { paymentAmountIssue } from "../hooks/usePaymentSelection";
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

function PaymentAmountCell({ bill, state, onChangeAmount }: {
  bill: ExportablePayable;
  state?: RowState;
  onChangeAmount: Props["onChangeAmount"];
}) {
  const errorId = useId();
  const amount = state?.amount ?? bill.balance;
  const problem = state?.selected ? paymentAmountIssue(amount, bill.balance) : null;
  return (
    <div className="space-y-1">
      <Input
        type="number"
        step="0.01"
        min={0.01}
        max={bill.balance}
        disabled={!bill.has_valid_clabe || !state?.selected || !!bill.payment_in_progress_at}
        value={amount}
        onChange={(event) => onChangeAmount(bill.id, Number(event.target.value))}
        aria-label={`Monto a pagar de factura ${bill.bill_number}`}
        aria-invalid={!!problem}
        aria-describedby={problem ? errorId : undefined}
        className={cn(
          "h-7 w-28 ml-auto text-right font-mono text-xs",
          problem && "border-destructive text-destructive focus-visible:ring-destructive",
        )}
      />
      {problem && (
        <p id={errorId} className="min-w-28 text-right text-xs text-destructive">
          {problem === "non-positive"
            ? "Captura un monto mayor a cero."
            : `No debe superar el saldo de ${formatCurrencyWithCode(bill.balance, bill.currency)}.`}
        </p>
      )}
    </div>
  );
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
  const anyEligibleSelected = bills?.some((bill) => bill.has_valid_clabe && !bill.payment_in_progress_at && rowState[bill.id]?.selected);
  const columns: ColumnDef<ExportablePayable>[] = [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={allEligibleSelected || (anyEligibleSelected ? "indeterminate" : false)}
          onCheckedChange={(v) => onToggleAll(Boolean(v))}
          aria-label="Seleccionar facturas elegibles"
        />
      ),
      enableSorting: false,
      cell: ({ row }) => (
        <Checkbox
          checked={rowState[row.original.id]?.selected ?? false}
          disabled={!row.original.has_valid_clabe || !!row.original.payment_in_progress_at}
          onCheckedChange={(v) => onToggleRow(row.original.id, Boolean(v), row.original.balance)}
          aria-label={`Seleccionar factura ${row.original.bill_number}`}
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
            <Badge variant="outline" className="ml-1 text-3xs">
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
        <span className="text-xs">{formatDateMty(row.original.due_date)}</span>
      ),
    },
    {
      id: "balance",
      header: "Saldo",
      accessorKey: "balance",
      meta: { kind: "money" },
      // G-B1/G-B2: el lote puede mezclar MXN y USD; formatear todo en MXN hacía
      // que el operador dispersara un monto en la divisa equivocada.
      cell: ({ row }) => (
        <span className="font-mono">
          {formatCurrencyWithCode(row.original.balance, row.original.currency)}
          {isFxMissing(row.original.currency, row.original.exchange_rate) && (
            <Badge
              variant="outline"
              className="ml-1 text-3xs border-warning/40 text-warning-text"
              title="Factura en divisa sin tipo de cambio capturado"
            >
              Sin TC
            </Badge>
          )}
        </span>
      ),
    },
    {
      id: "amount",
      header: "A pagar",
      enableSorting: false,
      meta: { kind: "number" },
      cell: ({ row }) => (
        <PaymentAmountCell bill={row.original} state={rowState[row.original.id]} onChangeAmount={onChangeAmount} />
      ),
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
      rowClassName={(b) => cn((!b.has_valid_clabe || b.payment_in_progress_at) && "opacity-60")}
    />
  );
}
