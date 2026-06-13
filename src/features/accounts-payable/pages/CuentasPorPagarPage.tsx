import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, FileClock, BarChart3, FileSpreadsheet } from "lucide-react";
import { Link } from "react-router-dom";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { useLiftgoTable } from "@/components/dataTable/v2";
import { useSuppliers } from "@/features/suppliers";
import { useToggleDialog } from "@/hooks/useDialogState";
import { usePageActions } from "@/contexts/PageActionsContext";
import { useAccountsPayableKpis } from "../hooks/useAccountsPayableKpis";
import { useAccountsPayableFilters } from "../hooks/useAccountsPayableFilters";
import type { SupplierBillListItem } from "../hooks/useSupplierBills";
import { SupplierBillFormDialog } from "../components/SupplierBillFormDialog";
import { SupplierBillDetailSheet } from "../components/SupplierBillDetailSheet";
import { ExportPaymentsDialog } from "../components/ExportPaymentsDialog";
import { SupplierBillsFilters } from "../components/SupplierBillsFilters";
import {
  useSupplierBillColumns,
  renderSupplierBillMobileCard,
} from "../components/supplierBillColumns";

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
  });

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
            <Button variant="outline" onClick={exportDialog.openDialog}>
              <FileSpreadsheet className="h-4 w-4 mr-1" />Exportar pagos
            </Button>
            <Button onClick={createDialog.openDialog}>
              <Plus className="h-4 w-4 mr-1" />Nueva Cuenta
            </Button>
          </div>
        }
        filters={<SupplierBillsFilters filters={f} kpis={kpis} suppliers={suppliers} />}
        isLoading={isLoading}
        table={table}
        onRowClick={(b) => setSelectedId(b.id)}
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
