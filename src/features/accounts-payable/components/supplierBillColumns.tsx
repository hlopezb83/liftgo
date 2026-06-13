import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { type ColumnDef } from "@/components/dataTable/v2";
import { formatCurrencyWithCode } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { EXPENSE_CATEGORY_LABELS, SUPPLIER_BILL_STATUS_LABELS, APPROVAL_STATUS_LABELS } from "../lib/supplierBillConstants";
import type { SupplierBillListItem } from "../hooks/useSupplierBills";

export function useSupplierBillColumns() {
  return useMemo<ColumnDef<SupplierBillListItem>[]>(() => [
    {
      id: "bill_number", header: "Folio", accessorKey: "bill_number",
      cell: ({ row }) => <span className="font-mono font-medium">{row.original.bill_number}</span>,
    },
    {
      id: "supplier", header: "Proveedor",
      accessorFn: (b) => b.suppliers?.name ?? "",
      cell: ({ row }) => <span>{row.original.suppliers?.name ?? "—"}</span>,
    },
    {
      id: "issue_date", header: "Emisión", accessorKey: "issue_date",
      cell: ({ row }) => formatDateDisplay(row.original.issue_date),
    },
    {
      id: "due_date", header: "Vence",
      accessorFn: (b) => b.due_date ?? "",
      cell: ({ row }) => formatDateDisplay(row.original.due_date),
    },
    {
      id: "total", header: "Total", accessorKey: "total", meta: { align: "right" },
      cell: ({ row }) => <span className="font-mono">{formatCurrencyWithCode(Number(row.original.total), row.original.currency)}</span>,
    },
    {
      id: "balance", header: "Saldo", accessorKey: "balance", meta: { align: "right" },
      cell: ({ row }) => (
        <span className={`font-mono font-semibold ${Number(row.original.balance) > 0 ? "text-foreground" : "text-muted-foreground"}`}>
          {formatCurrencyWithCode(Number(row.original.balance), row.original.currency)}
        </span>
      ),
    },
    {
      id: "status", header: "Estatus", accessorKey: "status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.status} label={SUPPLIER_BILL_STATUS_LABELS[row.original.status]} />
      ),
    },
    {
      id: "approval_status", header: "Aprobación", accessorKey: "approval_status",
      cell: ({ row }) => {
        const s = row.original.approval_status;
        if (s === "not_required") return <span className="text-xs text-muted-foreground">—</span>;
        const tone =
          s === "pending" ? "text-amber-600 dark:text-amber-400" :
          s === "approved" ? "text-emerald-600 dark:text-emerald-400" :
          "text-destructive";
        return <span className={`text-xs font-medium ${tone}`}>{APPROVAL_STATUS_LABELS[s]}</span>;
      },
    },
    {
      id: "category", header: "Categoría",
      accessorFn: (b) => b.category ?? "",
      cell: ({ row }) => row.original.category ? EXPENSE_CATEGORY_LABELS[row.original.category] : "—",
    },
  ], []);
}

export function renderSupplierBillMobileCard(
  b: SupplierBillListItem,
  onClick: (id: string) => void,
) {
  return (
    <Card onClick={() => onClick(b.id)} className="cursor-pointer">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono font-medium">{b.bill_number}</span>
          <StatusBadge status={b.status} label={SUPPLIER_BILL_STATUS_LABELS[b.status]} />
        </div>
        <p className="text-sm">{b.suppliers?.name ?? "—"}</p>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Saldo</span>
          <span className="font-mono font-semibold">{formatCurrencyWithCode(Number(b.balance), b.currency)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Vence: {formatDateDisplay(b.due_date)}</span>
          <span>{formatCurrencyWithCode(Number(b.total), b.currency)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
