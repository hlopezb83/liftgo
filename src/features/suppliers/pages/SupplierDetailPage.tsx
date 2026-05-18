import { useParams } from "react-router-dom";
import { useSuppliers, SUPPLIER_CATEGORIES } from "@/features/suppliers/hooks/useSuppliers";
import { useOperatingExpenses } from "@/features/expenses/hooks/useOperatingExpenses";
import { useMaintenanceLogs } from "@/features/maintenance/hooks/maintenance/useMaintenanceLogs";
import { useForkliftMap } from "@/features/fleet/hooks/forklifts/useForkliftMap";
import { DetailPageHeader } from "@/components/DetailPageHeader";
import { NotesCard } from "@/components/NotesCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { SupplierContactCard } from "@/features/suppliers/components/suppliers/SupplierContactCard";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { FileText, Wrench, DollarSign } from "lucide-react";

type LinkedExpense = { id: string; expense_date: string; category: string; description: string | null; amount: number };
type LinkedMaintenance = { id: string; performed_at: string; forklift_id: string; service_type: string; cost: number | null };

export default function SupplierDetailPage() {
  const { id } = useParams();
  const { data: suppliers, isLoading } = useSuppliers();
  const { data: expenses } = useOperatingExpenses();
  const { data: maintenanceLogs } = useMaintenanceLogs();
  const { forkliftMap } = useForkliftMap();

  const supplier = suppliers?.find((s) => s.id === id);

  const linkedExpenses = (expenses || []).filter((e) => e.supplier_id === id);
  const linkedMaintenance = (maintenanceLogs || []).filter((m) => m.supplier_id === id);

  const totalExpenses = linkedExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalMaintenance = linkedMaintenance.reduce((sum, m) => sum + (m.cost || 0), 0);

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
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Contact info */}
        <SupplierContactCard supplier={supplier} />

        <NotesCard value={supplier.notes || ""} readOnly />
      </div>

      {/* Financial summary */}
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

      {/* Linked expenses */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Gastos Operativos Vinculados</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable<LinkedExpense>
            data={linkedExpenses}
            keyExtractor={(e) => e.id}
            emptyMessage="Sin gastos vinculados"
            defaultSortKey="expense_date"
            defaultSortDirection="desc"
            columns={[
              { key: "expense_date", label: "Fecha", sortable: true, render: (e) => <span className="font-mono text-sm">{formatDateDisplay(e.expense_date)}</span> },
              { key: "category", label: "Categoría", sortable: true, render: (e) => <Badge variant="outline">{e.category}</Badge> },
              { key: "description", label: "Descripción", render: (e) => <span className="text-muted-foreground">{e.description || "—"}</span> },
              { key: "amount", label: "Monto", sortable: true, align: "right", render: (e) => <span className="font-mono">{formatCurrency(e.amount)}</span> },
            ]}
          />
        </CardContent>
      </Card>

      {/* Linked maintenance */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" />Mantenimiento Vinculado</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable<LinkedMaintenance>
            data={linkedMaintenance}
            keyExtractor={(m) => m.id}
            emptyMessage="Sin mantenimiento vinculado"
            defaultSortKey="performed_at"
            defaultSortDirection="desc"
            columns={[
              { key: "performed_at", label: "Fecha", sortable: true, render: (m) => <span className="font-mono text-sm">{formatDateDisplay(m.performed_at)}</span> },
              { key: "forklift", label: "Montacargas", accessor: (m) => forkliftMap.get(m.forklift_id)?.name ?? "", sortable: true, render: (m) => forkliftMap.get(m.forklift_id)?.name || "—" },
              { key: "service_type", label: "Tipo de Servicio", sortable: true, render: (m) => m.service_type },
              { key: "cost", label: "Costo", sortable: true, align: "right", accessor: (m) => m.cost ?? 0, render: (m) => <span className="font-mono">{formatCurrency(m.cost || 0)}</span> },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
