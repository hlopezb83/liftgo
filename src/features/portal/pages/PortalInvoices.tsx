import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { MobileCardList } from "@/components/layout/MobileCardList";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalInvoices } from "@/features/customers";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";

type Invoice = NonNullable<ReturnType<typeof usePortalInvoices>["data"]>[number];

export default function PortalInvoices() {
  const { data: invoices, isLoading } = usePortalInvoices();
  const navigate = useNavigateTransition();
  const isMobile = useIsMobile();

  const columns: ColumnDef<Invoice>[] = [
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
    ];

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
          {isMobile ? (
            <div className="p-3">
              <MobileCardList
                items={invoices ?? []}
                keyExtractor={(i) => i.id}
                emptyMessage="No se encontraron facturas"
                renderCard={(inv) => (
                  <Card
                    className="cursor-pointer active:bg-accent/40"
                    onClick={() => navigate(`/portal/invoices/${inv.id}`)}
                  >
                    <CardContent className="p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{inv.invoice_number}</span>
                        <StatusBadge status={inv.status} />
                      </div>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{formatDateDisplay(inv.issued_at)}</span>
                        <span className="font-mono font-semibold text-foreground">
                          {formatCurrency(Number(inv.total))}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Vence: {formatDateDisplay(inv.due_date)}
                      </div>
                    </CardContent>
                  </Card>
                )}
              />
            </div>
          ) : (
            <DataTableV2
              table={table}
              emptyMessage="No se encontraron facturas"
              onRowClick={(inv) => navigate(`/portal/invoices/${inv.id}`)}
            />
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
