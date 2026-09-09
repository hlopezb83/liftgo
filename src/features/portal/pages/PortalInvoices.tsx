import { useState } from "react";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { TablePagination } from "@/components/feedback/TablePagination";
import { TableSkeleton } from "@/components/feedback/TableSkeleton";
import { MobileCardList } from "@/components/layout/MobileCardList";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePortalInvoicesPage, type PortalInvoiceRow } from "@/features/customers";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";

type Invoice = PortalInvoiceRow;

const PAGE_SIZE = 25;

export default function PortalInvoices() {
  const [page, setPage] = useState(1);
  const { data: result, isLoading, isError, refetch } = usePortalInvoicesPage(page, PAGE_SIZE);
  const invoices = result?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil((result?.totalCount ?? 0) / PAGE_SIZE));
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
        meta: { kind: "date" },
        cell: ({ row }) => formatDateMty(row.original.issued_at),
      },
      {
        id: "due_date",
        header: "Vencimiento",
        accessorKey: "due_date",
        meta: { kind: "date" },
        cell: ({ row }) => formatDateMty(row.original.due_date),
      },
      {
        id: "total",
        header: "Total",
        accessorFn: (i) => Number(i.total),
        meta: { kind: "money" },
        cell: ({ row }) => <span className="font-mono">{formatCurrencyWithCode(Number(row.original.total), row.original.moneda ?? "MXN")}</span>,
      },
      {
        id: "status",
        header: "Estado",
        accessorKey: "status",
        meta: { kind: "badge" },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ];

  const table = useLiftgoTable<Invoice>({
    data: invoices,
    columns,
    getRowId: (i) => i.id,
    initialSorting: [{ id: "issued_at", desc: true }],
    enableSorting: false,
    paginated: false,
  });

  if (isLoading) return <TableSkeleton rows={6} columnCount={5} />;

  if (isError) {
    return (
      <PageContainer maxWidth="wide">
        <PageHeader title="Mis Facturas" />
        <QueryErrorState entity="tus facturas" onRetry={() => { void refetch(); }} />
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="wide">
      <PageHeader title="Mis Facturas" />
      <Card>
        <CardHeader><CardTitle className="text-base">Todas las Facturas</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isMobile ? (
            <div className="p-3">
              <MobileCardList
                items={invoices}
                keyExtractor={(i) => i.id}
                emptyMessage="Aún no tienes facturas. Cuando se emita tu primera factura aparecerá aquí. ¿Dudas? Contáctanos."
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
                        <span>{formatDateMty(inv.issued_at)}</span>
                        <span className="tabular-nums font-semibold text-foreground">
                          {formatCurrencyWithCode(Number(inv.total), inv.moneda ?? "MXN")}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Vence: {formatDateMty(inv.due_date)}
                      </div>
                    </CardContent>
                  </Card>
                )}
              />
            </div>
          ) : (
            <DataTableV2
              table={table}
              emptyMessage="Aún no tienes facturas. Cuando se emita tu primera factura aparecerá aquí. ¿Dudas? Contáctanos."
              onRowClick={(inv) => navigate(`/portal/invoices/${inv.id}`)}
            />
          )}
          <div className="border-t px-4">
            <TablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
