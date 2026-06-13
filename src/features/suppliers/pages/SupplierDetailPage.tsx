import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useSuppliers, SUPPLIER_CATEGORIES } from "../hooks/useSuppliers";
import { useSupplierBills } from "@/features/accounts-payable";
import { useMaintenanceLogs } from "@/features/maintenance";
import { DocumentAttachments, useForkliftMap } from "@/features/fleet";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { NotesCard } from "@/components/domain/NotesCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { SupplierContactCard } from "../components/suppliers/SupplierContactCard";
import { SupplierFormDialog } from "../components/suppliers/SupplierFormDialog";
import { SupplierContactsSection } from "../components/suppliers/SupplierContactsSection";
import { SupplierBankAccountsSection } from "../components/suppliers/SupplierBankAccountsSection";
import { RoleGuard } from "@/layouts/RoleGuard";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { FileText, Wrench, DollarSign, Pencil } from "lucide-react";

type LinkedExpense = { id: string; expense_date: string; category: string; description: string | null; amount: number };

type LinkedMaintenance = { id: string; performed_at: string; forklift_id: string; service_type: string; cost: number | null };

export default function SupplierDetailPage() {
  const { id } = useParams();
  const { data: suppliers, isLoading } = useSuppliers();
  const { data: bills } = useSupplierBills();
  const { data: maintenanceLogs } = useMaintenanceLogs();
  const { forkliftMap } = useForkliftMap();

  const supplier = suppliers?.find((s) => s.id === id);
  const [editOpen, setEditOpen] = useState(false);

  const linkedExpenses = useMemo<LinkedExpense[]>(
    () => (bills || [])
      .filter((b) => b.supplier_id === id && b.status !== "cancelled")
      .map((b) => ({
        id: b.id,
        expense_date: b.issue_date,
        category: b.category ?? "—",
        description: b.description,
        amount: Number(b.total),
      })),
    [bills, id],
  );
  const linkedMaintenance = useMemo(
    () => (maintenanceLogs || []).filter((m) => m.supplier_id === id),
    [maintenanceLogs, id],
  );

  const totalExpenses = linkedExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalMaintenance = linkedMaintenance.reduce((sum, m) => sum + (m.cost || 0), 0);

  const expenseColumns = useMemo<ColumnDef<LinkedExpense>[]>(
    () => [
      { id: "expense_date", header: "Fecha", accessorKey: "expense_date", cell: ({ row }) => <span className="font-mono text-sm">{formatDateDisplay(row.original.expense_date)}</span> },
      { id: "category", header: "Categoría", accessorKey: "category", cell: ({ row }) => <Badge variant="outline">{row.original.category}</Badge> },
      { id: "description", header: "Descripción", accessorKey: "description", cell: ({ row }) => <span className="text-muted-foreground">{row.original.description || "—"}</span> },
      { id: "amount", header: "Monto", accessorKey: "amount", meta: { align: "right" }, cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.amount)}</span> },
    ],
    [],
  );

  const maintenanceColumns = useMemo<ColumnDef<LinkedMaintenance>[]>(
    () => [
      { id: "performed_at", header: "Fecha", accessorKey: "performed_at", cell: ({ row }) => <span className="font-mono text-sm">{formatDateDisplay(row.original.performed_at)}</span> },
      { id: "forklift", header: "Montacargas", accessorFn: (m) => forkliftMap.get(m.forklift_id)?.name ?? "", cell: ({ row }) => forkliftMap.get(row.original.forklift_id)?.name || "—" },
      { id: "service_type", header: "Tipo de Servicio", accessorKey: "service_type", cell: ({ row }) => row.original.service_type },
      { id: "cost", header: "Costo", accessorFn: (m) => m.cost ?? 0, meta: { align: "right" }, cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.cost || 0)}</span> },
    ],
    [forkliftMap],
  );

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
    return <div className="p-6 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-48 w-full" /></div>;
  }

  if (!supplier) {
    return (
      <div className="p-6">
        <DetailPageHeader title="Proveedor no encontrado" backTo="/suppliers" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <DetailPageHeader
        title={supplier.name}
        backTo="/suppliers"
        badges={supplier.category ? <Badge variant="outline">{SUPPLIER_CATEGORIES[supplier.category] || supplier.category}</Badge> : undefined}
        actions={
          <RoleGuard module="Proveedores" minAccess="full">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" /> Editar
            </Button>
          </RoleGuard>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SupplierContactCard supplier={supplier} />
        <NotesCard value={supplier.notes || ""} readOnly />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SupplierContactsSection supplierId={supplier.id} />
        <SupplierBankAccountsSection supplierId={supplier.id} />
      </div>

      <DocumentAttachments entityType="supplier" entityId={supplier.id} />



      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="rounded-full bg-primary/10 p-3"><DollarSign className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Gastos Operativos</p>
              <p className="text-xl font-bold font-mono">{formatCurrency(totalExpenses)}</p>
              <p className="text-xs text-muted-foreground">{linkedExpenses.length} registro(s)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="rounded-full bg-primary/10 p-3"><Wrench className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Mantenimiento</p>
              <p className="text-xl font-bold font-mono">{formatCurrency(totalMaintenance)}</p>
              <p className="text-xs text-muted-foreground">{linkedMaintenance.length} registro(s)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Gastos Operativos Vinculados</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTableV2 table={expensesTable} emptyMessage="Sin gastos vinculados" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" />Mantenimiento Vinculado</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTableV2 table={maintenanceTable} emptyMessage="Sin mantenimiento vinculado" />
        </CardContent>
      </Card>

      <SupplierFormDialog open={editOpen} onOpenChange={setEditOpen} supplier={supplier} />
    </div>
  );
}
