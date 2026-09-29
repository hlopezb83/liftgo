import { useState } from "react";
import { useLiftgoTable } from "@/components/dataTable/v2";
import { AddIcon, FileClock, ChartIcon, FileSpreadsheet, KeyIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Button } from "@/components/ui/button";
import { usePageActions } from "@/contexts/pageActions";
import { useSuppliers } from "@/features/suppliers";
import { useHasModuleAccess } from "@/features/users";
import { useToggleDialog } from "@/hooks/useDialogState";
import { RoleGuard } from "@/layouts/RoleGuard";
import { Link } from "@/lib/router-compat-ui";
import { ExportPaymentsDialog } from "../components/ExportPaymentsDialog";
import {
  useSupplierBillColumns,
  renderSupplierBillMobileCard,
} from "../components/supplierBillColumns";
import { SupplierBillDetailSheet } from "../components/SupplierBillDetailSheet";
import { SupplierBillFormDialog } from "../components/SupplierBillFormDialog";
import { SupplierBillsFilters } from "../components/SupplierBillsFilters";
import { useAccountsPayableBillPage } from "../hooks/useAccountsPayableBillPage";
import { useAccountsPayableFilters } from "../hooks/useAccountsPayableFilters";
import { useAccountsPayableSummary } from "../hooks/useAccountsPayableSummary";
import {
  useAccountsPayableTableState,
  useClampAccountsPayablePage,
} from "../hooks/useAccountsPayableTableState";
import {
  useReleasablePaymentLocksCount,
  useReleaseStalePaymentLocks,
  STALE_LOCK_HOURS,
} from "../hooks/useReleaseStalePaymentLocks";
import type { SupplierBillListItem } from "../hooks/useSupplierBills";

export default function CuentasPorPagarPage() {
  const summary = useAccountsPayableSummary();
  const { data: suppliers } = useSuppliers();
  const f = useAccountsPayableFilters([], {
    mode: "server",
    availableMonths: summary.availableMonths,
    supplierIds: suppliers?.map((supplier) => supplier.id),
  });
  const createDialog = useToggleDialog();
  const exportDialog = useToggleDialog();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tableState = useAccountsPayableTableState(f.filterKey);
  const { pagination, sorting } = tableState;
  const sort = sorting[0];
  const pageQuery = useAccountsPayableBillPage({
    search: f.search,
    status: f.status,
    supplierId: f.supplierId,
    category: f.category,
    month: f.month,
    approval: f.approval,
    rep: f.rep,
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
    sortBy: sort?.id ?? "issue_date",
    sortDesc: sort?.desc ?? true,
    enabled: !f.isStale,
  });
  const isLoading = summary.isLoading || pageQuery.isLoading || f.isStale;
  const isError = summary.isError || pageQuery.isError;
  const refetch = () => Promise.all([summary.refetch(), pageQuery.refetch()]);
  const totalCount = pageQuery.data?.totalCount;
  const pageCount = Math.ceil((totalCount ?? 0) / pagination.pageSize);
  const tablePagination = {
    ...pagination,
    pageIndex: clampTablePageIndex(pagination.pageIndex, pageCount, totalCount),
  };

  useClampAccountsPayablePage(totalCount, pageCount, pagination, tableState.onPaginationChange);

  const releaseLocks = useReleaseStalePaymentLocks();
  // R7-12: el conteo viene del RPC (universo completo + las mismas
  // precondiciones del barrido), no de las filas visibles de la página.
  const { data: releasableLocks = 0 } = useReleasablePaymentLocksCount();

  const canCreate = useHasModuleAccess("Facturas de Proveedor", "full");
  const createActions = buildCreateActions(canCreate, createDialog.openDialog);
  usePageActions({ ...createActions, newLabel: "Nueva factura de proveedor" });

  const columns = useSupplierBillColumns();
  const table = useLiftgoTable<SupplierBillListItem>({
    data: pageQuery.data?.items,
    columns,
    getRowId: (b) => b.id,
    resetKey: f.filterKey,
    controlledPagination: tablePagination,
    onControlledPaginationChange: tableState.onPaginationChange,
    pageCount,
    controlledSorting: sorting,
    onControlledSortingChange: tableState.onSortingChange,
    manualSorting: true,
  });

  return (
    <>
      <ListPageLayout<SupplierBillListItem>
        title="Facturas de Proveedor"
        subtitle="Facturas de proveedores y su seguimiento de pago"
        totalCount={pageQuery.data?.totalCount}
        rowCount={pageQuery.data?.totalCount}
        actions={<AccountsPayableActions
          releasableLocks={releasableLocks}
          isReleasing={releaseLocks.isPending}
          onCreate={createDialog.openDialog}
          onExport={exportDialog.openDialog}
          onRelease={() => releaseLocks.mutate(STALE_LOCK_HOURS)}
        />}
        notice={<FxMissingBillsNotice isError={isError} count={summary.kpis.fxMissingCount} />}
        filters={
          <div className="space-y-3">
            <SupplierBillsFilters filters={f} kpis={summary.kpis} suppliers={suppliers} />
          </div>
        }
        isLoading={isLoading}
        isError={isError}
        onRetry={() => { void refetch(); }}
        table={table}
        onRowClick={(b) => setSelectedId(b.id)}
        hasActiveFilters={f.hasActive}
        onClearFilters={f.reset}
        emptyMessage="Sin cuentas por pagar registradas"
        emptyIcon={FileClock}
        emptyActionLabel={createActions.emptyActionLabel}
        onEmptyAction={createActions.onEmptyAction}
        skeletonColumns={8}
        mobileCardRender={(b) => renderSupplierBillMobileCard(b, setSelectedId)}
      />

      <SupplierBillFormDialog open={createDialog.open} onOpenChange={createDialog.setOpen} />
      <ExportPaymentsDialog open={exportDialog.open} onOpenChange={exportDialog.setOpen} />
      <SupplierBillDetailSheet
        billId={selectedId}
        open={selectedId !== null}
        onOpenChange={(o) => { if (!o) setSelectedId(null); }}
      />
    </>
  );
}

function buildCreateActions(enabled: boolean, onCreate: () => void) {
  if (!enabled) return { onNew: undefined, emptyActionLabel: undefined, onEmptyAction: undefined };
  return { onNew: onCreate, emptyActionLabel: "Nueva cuenta", onEmptyAction: onCreate };
}

function clampTablePageIndex(pageIndex: number, pageCount: number, totalCount: number | undefined) {
  if (totalCount === undefined) return pageIndex;
  return Math.min(pageIndex, Math.max(0, pageCount - 1));
}

interface AccountsPayableActionsProps {
  releasableLocks: number;
  isReleasing: boolean;
  onCreate: () => void;
  onExport: () => void;
  onRelease: () => void;
}

function AccountsPayableActions({
  releasableLocks,
  isReleasing,
  onCreate,
  onExport,
  onRelease,
}: AccountsPayableActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link to="/cuentas-por-pagar/antiguedad">
        <Button variant="outline" aria-label="Antigüedad">
          <ChartIcon className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Antigüedad</span>
        </Button>
      </Link>
      <Button variant="outline" onClick={onExport} aria-label="Exportar pagos">
        <FileSpreadsheet className="h-4 w-4 sm:mr-1" />
        <span className="hidden sm:inline">Exportar pagos</span>
      </Button>
      <RoleGuard module="Facturas de Proveedor" minAccess="full" fallback={null}>
        {/* El RPC decide cuáles bloqueos abandonados pueden liberarse. */}
        {releasableLocks > 0 && (
          <Button
            variant="outline"
            onClick={onRelease}
            disabled={isReleasing}
            aria-label="Liberar bloqueos de pago"
          >
            <KeyIcon className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Liberar bloqueos ({releasableLocks})</span>
          </Button>
        )}
        <Button onClick={onCreate}>
          <AddIcon className="h-4 w-4 mr-1" />Nueva factura
        </Button>
      </RoleGuard>
    </div>
  );
}

function FxMissingBillsNotice({ isError, count }: { isError: boolean; count: number }) {
  if (isError || count === 0) return null;
  const singular = count === 1;
  return (
    <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
      {count} factura{singular ? "" : "s"} de proveedor en divisa sin tipo de cambio {singular ? "no suma" : "no suman"} a los totales en MXN.
      Captura el tipo de cambio en la factura para incluirla.
    </p>
  );
}
