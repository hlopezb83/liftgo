import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortalInvoices } from "@/features/customers/hooks/customers/useCustomerPortal";
import { formatCurrency } from "@/lib/formatCurrency";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateDisplay } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@/components/DataTable";

type Invoice = NonNullable<ReturnType<typeof usePortalInvoices>["data"]>[number];

export default function PortalInvoices() {
  const { data: invoices, isLoading } = usePortalInvoices();
  const navigate = useNavigate();

  if (isLoading) return <Skeleton className="h-96" />;

  const columns: DataTableColumn<Invoice>[] = [
    { key: "invoice_number", label: "Factura #", sortable: true, render: (inv) => <span className="font-medium">{inv.invoice_number}</span> },
    { key: "issued_at", label: "Fecha", sortable: true, render: (inv) => formatDateDisplay(inv.issued_at) },
    { key: "due_date", label: "Vencimiento", sortable: true, render: (inv) => formatDateDisplay(inv.due_date) },
    { key: "total", label: "Total", sortable: true, align: "right", accessor: (i) => Number(i.total), render: (i) => <span className="font-mono">{formatCurrency(Number(i.total))}</span> },
    { key: "status", label: "Estado", sortable: true, render: (inv) => <StatusBadge status={inv.status} /> },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Mis Facturas</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">Todas las Facturas</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={invoices}
            keyExtractor={(i) => i.id}
            emptyMessage="No se encontraron facturas"
            defaultSortKey="issued_at"
            defaultSortDirection="desc"
            onRowClick={(inv) => navigate(`/portal/invoices/${inv.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
