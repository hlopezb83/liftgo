import { useState } from "react";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { NotesCard } from "@/components/domain/NotesCard";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { MaintenanceIcon, ExpenseIcon, EditIcon } from "@/components/icons";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentAttachments } from "@/features/fleet";
import { RoleGuard } from "@/layouts/RoleGuard";
import { serviceTypeLabel } from "@/lib/constants";
import { countLabel } from "@/lib/format/countLabel";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { isFxMissing, sumMoney, toMxn } from "@/lib/money";
import { getSupplierListBackTo } from "@/lib/navigation/customerInvoiceOrigins";
import { useLocation, useParams } from "@/lib/router-compat";
import { SupplierBankAccountsSection } from "../components/suppliers/SupplierBankAccountsSection";
import { SupplierContactCard } from "../components/suppliers/SupplierContactCard";
import { SupplierContactsSection } from "../components/suppliers/SupplierContactsSection";
import { SupplierFormDialog } from "../components/suppliers/SupplierFormDialog";
import { SupplierLinkedExpenses, type LinkedExpense } from "../components/suppliers/SupplierLinkedExpenses";
import { useSupplierLinkedBills, useSupplierLinkedMaintenance, type SupplierLinkedMaintenance } from "../hooks/useSupplierLinkedActivity";
import { useSupplier, SUPPLIER_CATEGORIES } from "../hooks/useSuppliers";

type LinkedMaintenance = SupplierLinkedMaintenance;

function LinkedTotal({ loading, error, total, count, entity, excluded = 0 }: {
  loading: boolean; error: boolean; total: number; count: number; entity: string; excluded?: number;
}) {
  if (error) return <p>No disponible</p>;
  if (loading) return <p role="status">Cargando {entity}…</p>;
  return <>
    <p className="text-xl font-bold tabular-nums">{formatCurrency(total)}</p>
    <p className="text-xs text-muted-foreground tabular-nums">{countLabel(count, "registro", "registros")}</p>
    {excluded > 0 && <p role="status" className="text-sm text-warning-text">
      Total parcial en MXN: {countLabel(excluded, "registro", "registros")} sin tipo de cambio válido {excluded === 1 ? "excluido" : "excluidos"}.
    </p>}
  </>;
}

function useSupplierListReturn() {
  const location = useLocation();
  const listBackTo = getSupplierListBackTo(location.state);
  return { backTo: listBackTo ?? "/suppliers", restoreListFilters: !listBackTo };
}

export default function SupplierDetailPage() {
  const { id } = useParams();
  const backNavigation = useSupplierListReturn();
  const { data: supplier, isLoading, isError, refetch } = useSupplier(id);
  const billsQuery = useSupplierLinkedBills(id);
  const { data: bills } = billsQuery;
  const maintenanceQuery = useSupplierLinkedMaintenance(id);
  const { data: maintenanceLogs } = maintenanceQuery;
  const expensesLoading = billsQuery.isLoading || !bills;
  const maintenanceLoading = maintenanceQuery.isLoading || !maintenanceLogs;

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

  const maintenanceColumns: ColumnDef<LinkedMaintenance>[] = [
    { id: "performed_at", header: "Fecha", accessorKey: "performed_at", cell: ({ row }) => <span className="font-mono text-sm">{formatDateMty(row.original.performed_at)}</span> },
    { id: "forklift", header: "Montacargas", accessorFn: (m) => m.forklifts?.name ?? "", cell: ({ row }) => row.original.forklifts?.name || "—" },
    { id: "service_type", header: "Tipo de Servicio", accessorKey: "service_type", cell: ({ row }) => serviceTypeLabel(row.original.service_type) },
    { id: "cost", header: "Costo", accessorFn: (m) => m.cost ?? 0, meta: { kind: "money" }, cell: ({ row }) => formatCurrency(row.original.cost || 0) },
  ];

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
        <DetailPageHeader title="Proveedor no encontrado" {...backNavigation} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <DetailPageHeader
        title={supplier.name}
        {...backNavigation}
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

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SupplierContactsSection supplierId={supplier.id} />
        <SupplierBankAccountsSection supplierId={supplier.id} />
      </div>

      <DocumentAttachments entityType="supplier" entityId={supplier.id} accessModule="Proveedores" />
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

      <SupplierLinkedExpenses key={supplier.id} expenses={linkedExpenses} isLoading={expensesLoading}
        isError={billsQuery.isError} error={billsQuery.error} isFetching={billsQuery.isFetching}
        onRetry={() => { void billsQuery.refetch(); }} />

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
