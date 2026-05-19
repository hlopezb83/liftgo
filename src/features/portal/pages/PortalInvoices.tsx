import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortalInvoices } from "@/features/customers/hooks/customers/useCustomerPortal";
import { formatCurrency } from "@/lib/formatCurrency";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateDisplay } from "@/lib/utils";
import {
  DataTableV2,
  useLiftgoTable,
  toColumnDefs,
  type LegacyColumn,
} from "@/components/dataTable/v2";

type Invoice = NonNullable<ReturnType<typeof usePortalInvoices>["data"]>[number];

export default function PortalInvoices() {
  const { data: invoices, isLoading } = usePortalInvoices();
  const navigate = useNavigate();

  const columns = useMemo(
    () =>
      toColumnDefs<Invoice>([
        { key: "invoice_number", label: "Factura #", sortable: true, render: (inv) => <span className="font-medium">{inv.invoice_number}</span> },
        { key: "issued_at", label: "Fecha", sortable: true, render: (inv) => formatDateDisplay(inv.issued_at) },
        { key: "due_date", label: "Vencimiento", sortable: true, render: (inv) => formatDateDisplay(inv.due_date) },
        { key: "total", label: "Total", sortable: true, align: "right", accessor: (i) => Number(i.total), render: (i) => <span className="font-mono">{formatCurrency(Number(i.total))}</span> },
        { key: "status", label: "Estado", sortable: true, render: (inv) => <StatusBadge status={inv.status} /> },
      ] satisfies LegacyColumn<Invoice>[]),
    [],
  );

  const table = useLiftgoTable<Invoice>({
    data: invoices,
    columns,
    getRowId: (i) => i.id,
    initialSorting: [{ id: "issued_at", desc: true }],
    paginated: false,
  });

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Mis Facturas</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">Todas las Facturas</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTableV2
            table={table}
            emptyMessage="No se encontraron facturas"
            onRowClick={(inv) => navigate(`/portal/invoices/${inv.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
