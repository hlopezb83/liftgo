import { useState } from "react";
import { Link } from "react-router";
import { useLiftgoTable } from "@/components/dataTable/v2";
import { ListTruncationNotice } from "@/components/feedback/ListTruncationNotice";
import { AddIcon, FileClock, ChartIcon, FileSpreadsheet, KeyIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Button } from "@/components/ui/button";
import { usePageActions } from "@/contexts/pageActions";
import { useSuppliers } from "@/features/suppliers";
import { useHasModuleAccess } from "@/features/users";
import { useToggleDialog } from "@/hooks/useDialogState";
import { RoleGuard } from "@/layouts/RoleGuard";
import { visibleListRows } from "@/lib/supabase/constants";
import { ExportPaymentsDialog } from "../components/ExportPaymentsDialog";
import {
  useSupplierBillColumns,
  renderSupplierBillMobileCard,
} from "../components/supplierBillColumns";
import { SupplierBillDetailSheet } from "../components/SupplierBillDetailSheet";
import { SupplierBillFormDialog } from "../components/SupplierBillFormDialog";
import { SupplierBillsFilters } from "../components/SupplierBillsFilters";
import { useAccountsPayableFilters } from "../hooks/useAccountsPayableFilters";
import { useAccountsPayableKpis } from "../hooks/useAccountsPayableKpis";
import {
  useReleasablePaymentLocksCount,
  useReleaseStalePaymentLocks,
  STALE_LOCK_HOURS,
} from "../hooks/useReleaseStalePaymentLocks";
import type { SupplierBillListItem } from "../hooks/useSupplierBills";

export default function CuentasPorPagarPage() {
  const { bills, kpis, isLoading, isError, refetch } = useAccountsPayableKpis();
  const { data: suppliers } = useSuppliers();
  // N8-r3: filtros y tabla operan sobre las filas visibles (sin la fila
  // extra del limit+1); el crudo (`bills`) queda solo para el aviso.
  const f = useAccountsPayableFilters(visibleListRows(bills));
  const createDialog = useToggleDialog();
  const exportDialog = useToggleDialog();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const releaseLocks = useReleaseStalePaymentLocks();
  // R7-12: el conteo viene del RPC (universo completo + las mismas
  // precondiciones del barrido), no de las filas visibles de la página.
  const { data: releasableLocks = 0 } = useReleasablePaymentLocksCount();

  const canCreate = useHasModuleAccess("Facturas de Proveedor", "full");
  usePageActions({ onNew: canCreate ? createDialog.openDialog : undefined, newLabel: "Nueva factura de proveedor" });

  const columns = useSupplierBillColumns();
  const table = useLiftgoTable<SupplierBillListItem>({
    data: f.filtered,
    columns,
    getRowId: (b) => b.id,
    resetKey: f.filterKey,
  });

  return (
    <>
      <ListPageLayout<SupplierBillListItem>
        title="Facturas de Proveedor"
        subtitle="Facturas de proveedores y su seguimiento de pago"
        totalCount={f.filtered.length}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/cuentas-por-pagar/antiguedad">
              <Button variant="outline" aria-label="Antigüedad">
                <ChartIcon className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Antigüedad</span>
              </Button>
            </Link>
            <Button variant="outline" onClick={exportDialog.openDialog} aria-label="Exportar pagos">
              <FileSpreadsheet className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Exportar pagos</span>
            </Button>
            <RoleGuard module="Facturas de Proveedor" minAccess="full" fallback={null}>
              {/* R6 A2-3: lotes abandonados dejaban facturas marcadas como
                  "pago en proceso". El RPC decide cuáles son liberables. */}
              {lockedCount > 0 && (
                <Button
                  variant="outline"
                  onClick={() => { releaseLocks.mutate(24); }}
                  disabled={releaseLocks.isPending}
                  aria-label="Liberar bloqueos de pago"
                >
                  <KeyIcon className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Liberar bloqueos</span>
                </Button>
              )}
              <Button onClick={createDialog.openDialog}>
                <AddIcon className="h-4 w-4 mr-1" />Nueva factura
              </Button>
            </RoleGuard>
          </div>

        }
        notice={
          <>
            <ListTruncationNotice rows={bills} />
            {/* G-B6: paridad con el reporte de antigüedad. Las facturas en divisa
                sin tipo de cambio se excluyen de los KPIs; sin aviso los totales
                se veían menores sin explicación. */}
            {!isError && kpis.fxMissingCount > 0 && (
              <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
                {kpis.fxMissingCount} factura{kpis.fxMissingCount === 1 ? "" : "s"} de proveedor en divisa sin
                tipo de cambio {kpis.fxMissingCount === 1 ? "no suma" : "no suman"} a los totales en MXN.
                Captura el tipo de cambio en la factura para incluirla.
              </p>
            )}
          </>
        }
        filters={
          <div className="space-y-3">
            <SupplierBillsFilters filters={f} kpis={kpis} suppliers={suppliers} />
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
        emptyActionLabel={canCreate ? "Nueva cuenta" : undefined}
        onEmptyAction={canCreate ? createDialog.openDialog : undefined}
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
