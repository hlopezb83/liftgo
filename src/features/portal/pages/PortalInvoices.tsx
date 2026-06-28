import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { usePortalInvoices } from "@/features/customers";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateDisplay } from "@/lib/utils";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";

type Invoice = NonNullable<ReturnType<typeof usePortalInvoices>["data"]>[number];

export default function PortalInvoices() {
  const { data: invoices, isLoading } = usePortalInvoices();
  const navigate = useNavigate();

  const columns = useMemo<ColumnDef<Invoice>[]>(
    () => [
      {
        id: "invoice_number",
        header: "Factura #",
        accessorKey: "invoice_number",
        cell: ({ row }) => <span className="font-medium">{row.original.invoice_number}</span>,
      },
      {
        id: "issued_at",
        header: "Fecha",
        accessorKey: "issued_at",
        cell: ({ row }) => formatDateDisplay(row.original.issued_at),
      },
      {
        id: "due_date",
        header: "Vencimiento",
        accessorKey: "due_date",
        cell: ({ row }) => formatDateDisplay(row.original.due_date),
      },
      {
        id: "total",
        header: "Total",
        accessorFn: (i) => Number(i.total),
        meta: { align: "right" },
        cell: ({ row }) => <span className="font-mono">{formatCurrency(Number(row.original.total))}</span>,
      },
      {
        id: "status",
        header: "Estado",
        accessorKey: "status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
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
    <PageContainer maxWidth="wide">
      <PageHeader title="Mis Facturas" />
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
    </PageContainer>
  );
}
