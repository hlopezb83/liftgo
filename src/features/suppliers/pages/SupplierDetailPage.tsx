import { useState } from "react";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { NotesCard } from "@/components/domain/NotesCard";
import { ListTruncationNotice } from "@/components/feedback/ListTruncationNotice";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { DocumentIcon, MaintenanceIcon, ExpenseIcon, EditIcon } from "@/components/icons";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupplierBills } from "@/features/accounts-payable";
import { DocumentAttachments, useForkliftMap } from "@/features/fleet";
import { useMaintenanceLogs } from "@/features/maintenance";
import { RoleGuard } from "@/layouts/RoleGuard";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency, formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { isFxMissing, sumMoney, toMxn } from "@/lib/money";
import { useParams } from "@/lib/router-compat";
import { SupplierBankAccountsSection } from "../components/suppliers/SupplierBankAccountsSection";
import { SupplierContactCard } from "../components/suppliers/SupplierContactCard";
import { SupplierContactsSection } from "../components/suppliers/SupplierContactsSection";
import { SupplierFormDialog } from "../components/suppliers/SupplierFormDialog";
import { useSupplier, SUPPLIER_CATEGORIES } from "../hooks/useSuppliers";

type LinkedExpense = { id: string; expense_date: string; category: string; description: string | null; amount: number | null; originalAmount: number; currency: string };

type LinkedMaintenance = { id: string; performed_at: string; forklift_id: string; service_type: string; cost: number | null };

function LinkedTotal({ loading, error, total, count, entity, excluded = 0 }: {
  loading: boolean; error: boolean; total: number; count: number; entity: string; excluded?: number;
}) {
  if (error) return <p>No disponible</p>;
  if (loading) return <p role="status">Cargando {entity}…</p>;
  return <>
    <p className="text-xl font-bold tabular-nums">{formatCurrency(total)}</p>
    <p className="text-xs text-muted-foreground">{count} registro(s)</p>
    {excluded > 0 && <p role="status" className="text-sm text-warning-text">
      Total parcial en MXN: {excluded} registro(s) sin tipo de cambio válido excluidos.
    </p>}
  </>;
}

export default function SupplierDetailPage() {
  const { id } = useParams();
  const { data: supplier, isLoading, isError, refetch } = useSupplier(id);
  const billsQuery = useSupplierBills();
  const { data: bills } = billsQuery;
  const maintenanceQuery = useMaintenanceLogs();
  const { data: maintenanceLogs } = maintenanceQuery;
  const expensesLoading = billsQuery.isLoading || !bills;
  const maintenanceLoading = maintenanceQuery.isLoading || !maintenanceLogs;
  const { forkliftMap } = useForkliftMap();

  const [editOpen, setEditOpen] = useState(false);

  // FIX B1: el total de gastos sumaba `total` en crudo, mezclando facturas en
  // USD con las de MXN (como sumar dólares y pesos en la misma cuenta).
  // Ahora cada factura se convierte a MXN con su tipo de cambio.
  const linkedExpenses: LinkedExpense[] = (bills || [])
    .filter((b) => b.supplier_id === id && b.status !== "cancelled")
    .map((b) => ({
      id: b.id,
      expense_date: b.issue_date,
      category: b.category ?? "—",
      description: b.description,
      amount: isFxMissing(b.currency, b.exchange_rate) ? null : toMxn(Number(b.total), b.currency, b.exchange_rate),
      originalAmount: Number(b.total),
      currency: (b.currency ?? "MXN").toUpperCase(),
    }));

  const linkedMaintenance = (maintenanceLogs || []).filter((m) => m.supplier_id === id);

  const totalExpenses = sumMoney(linkedExpenses.map(e => e.amount));
  const missingFxCount = linkedExpenses.filter(e => e.amount === null).length;
  const totalMaintenance = linkedMaintenance.reduce((sum, m) => sum + (m.cost || 0), 0);

  const expenseColumns: ColumnDef<LinkedExpense>[] = [
    { id: "expense_date", header: "Fecha", accessorKey: "expense_date", cell: ({ row }) => <span className="font-mono text-sm">{formatDateMty(row.original.expense_date)}</span> },
    { id: "category", header: "Categoría", accessorKey: "category", cell: ({ row }) => <Badge variant="outline">{row.original.category}</Badge> },
    { id: "description", header: "Descripción", accessorKey: "description", cell: ({ row }) => <span className="text-muted-foreground">{row.original.description || "—"}</span> },
    { id: "amount", header: "Monto MXN", accessorKey: "amount", meta: { kind: "money" }, cell: ({ row }) => row.original.amount === null
      ? <span>{formatCurrencyWithCode(row.original.originalAmount, row.original.currency)} {row.original.currency} · Sin TC válido</span>
      : formatCurrency(row.original.amount) },
  ];

  const maintenanceColumns: ColumnDef<LinkedMaintenance>[] = [
    { id: "performed_at", header: "Fecha", accessorKey: "performed_at", cell: ({ row }) => <span className="font-mono text-sm">{formatDateMty(row.original.performed_at)}</span> },
    { id: "forklift", header: "Montacargas", accessorFn: (m) => forkliftMap.get(m.forklift_id)?.name ?? "", cell: ({ row }) => forkliftMap.get(row.original.forklift_id)?.name || "—" },
    { id: "service_type", header: "Tipo de Servicio", accessorKey: "service_type", cell: ({ row }) => row.original.service_type },
    { id: "cost", header: "Costo", accessorFn: (m) => m.cost ?? 0, meta: { kind: "money" }, cell: ({ row }) => formatCurrency(row.original.cost || 0) },
  ];

  const expensesTable = useLiftgoTable<LinkedExpense>({
    data: linkedExpenses,
    columns: expenseColumns,
    getRowId: (e) => e.id,
    initialSorting: [{ id: "expense_date", desc: true }],
    paginated: false,
  });

  const maintenanceTable = useLiftgoTable<LinkedMaintenance>({
    data: linkedMaintenance,
    columns: maintenanceColumns,
    getRowId: (m) => m.id,
    initialSorting: [{ id: "performed_at", desc: true }],
    paginated: false,
  });

  if (isLoading) {
    return <PageContainer className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-48 w-full" /></PageContainer>;
  }

  if (isError) {
    return (
      <PageContainer>
        <QueryErrorState entity="los proveedores" onRetry={() => { void refetch(); }} />
      </PageContainer>
    );
  }

  if (!supplier) {
    return (
      <PageContainer>
        <DetailPageHeader title="Proveedor no encontrado" backTo="/suppliers" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <DetailPageHeader
        title={supplier.name}
        backTo="/suppliers"
        badges={supplier.category ? <Badge variant="outline">{SUPPLIER_CATEGORIES[supplier.category] || supplier.category}</Badge> : undefined}
        actions={
          <RoleGuard module="Proveedores" minAccess="full" fallback={null}>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <EditIcon className="h-4 w-4 mr-2" /> Editar
            </Button>
          </RoleGuard>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <SupplierContactCard supplier={supplier} />
        <NotesCard value={supplier.notes || ""} readOnly />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SupplierContactsSection supplierId={supplier.id} />
        <SupplierBankAccountsSection supplierId={supplier.id} />
      </div>

      <DocumentAttachments entityType="supplier" entityId={supplier.id} accessModule="Proveedores" />



      {/* FIX B5: los totales de abajo se calculan sobre listas con tope de
          filas; sin este aviso el usuario creería que ve el total completo. */}
      <ListTruncationNotice rows={maintenanceLogs} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="rounded-full bg-primary/10 p-3"><ExpenseIcon className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Gastos Operativos</p>
              <LinkedTotal loading={expensesLoading} error={billsQuery.isError}
                total={totalExpenses} count={linkedExpenses.length} entity="gastos" excluded={missingFxCount} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="rounded-full bg-primary/10 p-3"><MaintenanceIcon className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Mantenimiento</p>
              <LinkedTotal loading={maintenanceLoading} error={maintenanceQuery.isError}
                total={totalMaintenance} count={linkedMaintenance.length} entity="mantenimiento" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><DocumentIcon className="h-4 w-4" />Gastos Operativos Vinculados</CardTitle></CardHeader>
        <CardContent className="p-0">
          {billsQuery.isError ? (
            <QueryErrorState bare entity="los gastos vinculados" error={billsQuery.error}
              isRetrying={billsQuery.isFetching} onRetry={() => { void billsQuery.refetch(); }} />
          ) : expensesLoading ? <Skeleton className="h-24 w-full" /> : (
            <DataTableV2 table={expensesTable} emptyMessage="Sin gastos vinculados" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><MaintenanceIcon className="h-4 w-4" />Mantenimiento Vinculado</CardTitle></CardHeader>
        <CardContent className="p-0">
          {maintenanceQuery.isError ? (
            <QueryErrorState bare entity="el mantenimiento vinculado" error={maintenanceQuery.error}
              isRetrying={maintenanceQuery.isFetching} onRetry={() => { void maintenanceQuery.refetch(); }} />
          ) : maintenanceLoading ? <Skeleton className="h-24 w-full" /> : (
            <DataTableV2 table={maintenanceTable} emptyMessage="Sin mantenimiento vinculado" />
          )}
        </CardContent>
      </Card>

      <SupplierFormDialog open={editOpen} onOpenChange={setEditOpen} supplier={supplier} />
    </PageContainer>
  );
}
