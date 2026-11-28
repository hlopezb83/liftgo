import { useCallback, useRef, useState } from "react";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { DocumentIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SupplierBillDetailSheet } from "@/features/accounts-payable";
import { useHasModuleAccess } from "@/features/users";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency, formatCurrencyWithCode } from "@/lib/format/formatCurrency";

export type LinkedExpense = { id: string; expense_date: string; category: string; description: string | null; amount: number | null; originalAmount: number; currency: string };

const columns: ColumnDef<LinkedExpense>[] = [
  { id: "expense_date", header: "Fecha", accessorKey: "expense_date", cell: ({ row }) => <span className="font-mono text-sm">{formatDateMty(row.original.expense_date)}</span> },
  { id: "category", header: "Categoría", accessorKey: "category", cell: ({ row }) => <Badge variant="outline">{row.original.category}</Badge> },
  { id: "description", header: "Descripción", accessorKey: "description", cell: ({ row }) => <span data-supplier-bill-id={row.original.id} className="text-muted-foreground">{row.original.description || "—"}</span> },
  { id: "amount", header: "Monto MXN", accessorKey: "amount", meta: { kind: "money" }, cell: ({ row }) => row.original.amount === null
    ? <span>{formatCurrencyWithCode(row.original.originalAmount, row.original.currency)} {row.original.currency} · Sin TC válido</span>
    : formatCurrency(row.original.amount) },
];

interface Props {
  expenses: LinkedExpense[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  error: unknown;
  onRetry: () => void;
}

export function SupplierLinkedExpenses({ expenses, isLoading, isError, isFetching, error, onRetry }: Props) {
  const canViewBills = useHasModuleAccess("Facturas de Proveedor", "read");
  const [billId, setBillId] = useState<string | null>(null);
  const [billOpen, setBillOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const table = useLiftgoTable({ data: expenses, columns, getRowId: (expense) => expense.id,
    initialSorting: [{ id: "expense_date", desc: true }], paginated: false });
  const restoreFocus = useCallback((event: Event) => {
    const marker = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-supplier-bill-id]") ?? [])
      .find((node) => node.dataset.supplierBillId === billId);
    const action = marker?.closest("tr")?.querySelector<HTMLElement>("[data-table-row-action]");
    const target = action?.isConnected && action.getClientRects().length > 0 ? action : listRef.current;
    if (!target?.isConnected || target.getClientRects().length === 0) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
  }, [billId]);

  return <>
    <Card ref={listRef} role="region" aria-label="Gastos operativos vinculados" tabIndex={-1}>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><DocumentIcon className="h-4 w-4" />Gastos Operativos Vinculados</CardTitle></CardHeader>
      <CardContent className="p-0">
        {isError ? <QueryErrorState bare entity="los gastos vinculados" error={error} isRetrying={isFetching} onRetry={onRetry} />
          : isLoading ? <Skeleton className="h-24 w-full" /> : (
            <DataTableV2 table={table} emptyMessage="Sin gastos vinculados"
              rowAction={canViewBills ? { columnId: "description", label: () => "Ver factura de proveedor" } : undefined}
              onRowClick={canViewBills ? (expense) => { setBillId(expense.id); setBillOpen(true); } : undefined} />
          )}
      </CardContent>
    </Card>
    {canViewBills && <SupplierBillDetailSheet key={billId} billId={billId} open={billOpen} onOpenChange={setBillOpen} onCloseAutoFocus={restoreFocus} />}
  </>;
}
