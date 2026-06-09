import { useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileClock, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { SearchBar } from "@/components/SearchBar";
import { ListPageLayout } from "@/components/ListPageLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { formatCurrencyWithCode } from "@/lib/formatCurrency";
import { capitalize, formatDateDisplay, parseDateLocal } from "@/lib/utils";
import { useSuppliers } from "@/features/suppliers/hooks/useSuppliers";
import { useToggleDialog } from "@/hooks/useDialogState";
import { useAccountsPayableKpis } from "../hooks/useAccountsPayableKpis";
import { useAccountsPayableFilters } from "../hooks/useAccountsPayableFilters";
import {
  EXPENSE_CATEGORY_LABELS,
  SUPPLIER_BILL_STATUSES,
  SUPPLIER_BILL_STATUS_LABELS,
  APPROVAL_STATUSES,
  APPROVAL_STATUS_LABELS,
} from "../lib/supplierBillConstants";
import type { SupplierBillListItem } from "../hooks/useSupplierBills";
import { AccountsPayableKpiCards } from "../components/AccountsPayableKpiCards";
import { SupplierBillFormDialog } from "../components/SupplierBillFormDialog";
import { SupplierBillDetailSheet } from "../components/SupplierBillDetailSheet";

export default function CuentasPorPagarPage() {
  const { bills, kpis, isLoading } = useAccountsPayableKpis();
  const { data: suppliers } = useSuppliers();
  const f = useAccountsPayableFilters(bills);
  const createDialog = useToggleDialog();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<SupplierBillListItem>[]>(() => [
    {
      id: "bill_number",
      header: "Folio",
      accessorKey: "bill_number",
      cell: ({ row }) => <span className="font-mono font-medium">{row.original.bill_number}</span>,
    },
    {
      id: "supplier",
      header: "Proveedor",
      accessorFn: (b) => b.suppliers?.name ?? "",
      cell: ({ row }) => <span>{row.original.suppliers?.name ?? "—"}</span>,
    },
    {
      id: "issue_date",
      header: "Emisión",
      accessorKey: "issue_date",
      cell: ({ row }) => formatDateDisplay(row.original.issue_date),
    },
    {
      id: "due_date",
      header: "Vence",
      accessorFn: (b) => b.due_date ?? "",
      cell: ({ row }) => formatDateDisplay(row.original.due_date),
    },
    {
      id: "total",
      header: "Total",
      accessorKey: "total",
      meta: { align: "right" },
      cell: ({ row }) => <span className="font-mono">{formatCurrencyWithCode(Number(row.original.total), row.original.currency)}</span>,
    },
    {
      id: "balance",
      header: "Saldo",
      accessorKey: "balance",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className={`font-mono font-semibold ${Number(row.original.balance) > 0 ? "text-foreground" : "text-muted-foreground"}`}>
          {formatCurrencyWithCode(Number(row.original.balance), row.original.currency)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Estatus",
      accessorKey: "status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.status} label={SUPPLIER_BILL_STATUS_LABELS[row.original.status]} />
      ),
    },
    {
      id: "approval_status",
      header: "Aprobación",
      accessorKey: "approval_status",
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
      id: "category",
      header: "Categoría",
      accessorFn: (b) => b.category ?? "",
      cell: ({ row }) => row.original.category ? EXPENSE_CATEGORY_LABELS[row.original.category] : "—",
    },
  ], []);

  const table = useLiftgoTable<SupplierBillListItem>({
    data: f.filtered,
    columns,
    getRowId: (b) => b.id,
  });

  const mobileCard = (b: SupplierBillListItem) => (
    <Card onClick={() => setSelectedId(b.id)} className="cursor-pointer">
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

  return (
    <>
      <ListPageLayout<SupplierBillListItem>
        title="Cuentas por Pagar"
        subtitle="Facturas de proveedores y su seguimiento de pago"
        totalCount={f.filtered.length}
        actions={
          <div className="flex gap-2">
            <Link to="/cuentas-por-pagar/antiguedad">
              <Button variant="outline">
                <BarChart3 className="h-4 w-4 mr-1" />Antigüedad
              </Button>
            </Link>
            <Button onClick={createDialog.openDialog}>
              <Plus className="h-4 w-4 mr-1" />Nueva Cuenta
            </Button>
          </div>
        }
        filters={
          <div className="space-y-3">
            <AccountsPayableKpiCards kpis={kpis} />
            <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
              <SearchBar
                value={f.search}
                onChange={(v) => f.set("search", v)}
                placeholder="Folio, UUID, proveedor o descripción…"
                className="sm:max-w-xs"
              />
              <Select value={f.status} onValueChange={(v) => f.set("status", v as typeof f.status)}>
                <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estatus</SelectItem>
                  {SUPPLIER_BILL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{SUPPLIER_BILL_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={f.supplierId} onValueChange={(v) => f.set("supplierId", v)}>
                <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los proveedores</SelectItem>
                  {(suppliers ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={f.month} onValueChange={(v) => f.set("month", v)}>
                <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los meses</SelectItem>
                  {f.availableMonths.map((m) => (
                    <SelectItem key={m} value={m}>
                      {capitalize(format(parseDateLocal(m + "-15"), "MMM yyyy", { locale: es }))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={f.category} onValueChange={(v) => f.set("category", v as typeof f.category)}>
                <SelectTrigger className="w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {Object.entries(EXPENSE_CATEGORY_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        }
        isLoading={isLoading}
        table={table}
        onRowClick={(b) => setSelectedId(b.id)}
        emptyMessage="Sin cuentas por pagar registradas"
        emptyIcon={FileClock}
        emptyActionLabel="Nueva Cuenta"
        onEmptyAction={createDialog.openDialog}
        skeletonColumns={8}
        mobileCardRender={mobileCard}
      />

      <SupplierBillFormDialog open={createDialog.open} onOpenChange={createDialog.setOpen} />
      <SupplierBillDetailSheet
        billId={selectedId}
        open={selectedId !== null}
        onOpenChange={(o) => { if (!o) setSelectedId(null); }}
      />
    </>
  );
}
