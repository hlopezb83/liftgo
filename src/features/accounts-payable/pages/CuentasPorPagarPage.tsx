import { useState } from "react";
import { Link } from "react-router";
import { useLiftgoTable } from "@/components/dataTable/v2";
import { AddIcon, FileClock, ChartIcon, FileSpreadsheet } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Button } from "@/components/ui/button";
import { usePageActions } from "@/contexts/pageActions";
import { useSuppliers } from "@/features/suppliers";
import { useToggleDialog } from "@/hooks/useDialogState";
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
import type { SupplierBillListItem } from "../hooks/useSupplierBills";

export default function CuentasPorPagarPage() {
  const { bills, kpis, isLoading } = useAccountsPayableKpis();
  const { data: suppliers } = useSuppliers();
  const f = useAccountsPayableFilters(bills);
  const createDialog = useToggleDialog();
  const exportDialog = useToggleDialog();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  usePageActions({ onNew: createDialog.openDialog, newLabel: "Nueva factura de proveedor" });

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
            <Button onClick={createDialog.openDialog}>
              <AddIcon className="h-4 w-4 mr-1" />Nueva Factura
            </Button>
          </div>

        }
        filters={<SupplierBillsFilters filters={f} kpis={kpis} suppliers={suppliers} />}
        isLoading={isLoading}
        table={table}
        onRowClick={(b) => setSelectedId(b.id)}
        hasActiveFilters={f.hasActive}
        onClearFilters={f.reset}
        emptyMessage="Sin cuentas por pagar registradas"
        emptyIcon={FileClock}
        emptyActionLabel="Nueva Cuenta"
        onEmptyAction={createDialog.openDialog}
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
