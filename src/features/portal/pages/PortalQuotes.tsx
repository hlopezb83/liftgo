import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { usePortalQuotes } from "../hooks/usePortalExtras";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";

import { useNavigateTransition } from "@/hooks/useNavigateTransition";
type Quote = NonNullable<ReturnType<typeof usePortalQuotes>["data"]>[number];

export default function PortalQuotes() {
  const { data, isLoading } = usePortalQuotes();
  const navigate = useNavigateTransition();

  const columns = useMemo<ColumnDef<Quote>[]>(() => [
    { id: "quote_number", header: "Cotización #", accessorKey: "quote_number",
      cell: ({ row }) => <span className="font-medium">{row.original.quote_number}</span> },
    { id: "created_at", header: "Fecha", accessorKey: "created_at",
      cell: ({ row }) => formatDateDisplay(row.original.created_at) },
    { id: "valid_until", header: "Válida hasta", accessorKey: "valid_until",
      cell: ({ row }) => row.original.valid_until ? formatDateDisplay(row.original.valid_until) : "—" },
    { id: "total", header: "Total", accessorFn: (q) => Number(q.total), meta: { align: "right" },
      cell: ({ row }) => <span className="font-mono">{formatCurrency(Number(row.original.total))}</span> },
    { id: "status", header: "Estado", accessorKey: "status",
      cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ], []);

  const table = useLiftgoTable<Quote>({
    data, columns, getRowId: (q) => q.id,
    initialSorting: [{ id: "created_at", desc: true }],
    paginated: false,
  });

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <PageContainer maxWidth="wide">
      <PageHeader title="Mis Cotizaciones" />
      <Card>
        <CardHeader><CardTitle className="text-base">Todas las cotizaciones</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTableV2
            table={table}
            emptyMessage="No hay cotizaciones para mostrar"
            onRowClick={(q) => navigate(`/portal/quotes/${q.id}`)}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
