
import { useMemo, useState } from "react";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ViewIcon, ChevronRightIcon, InvoiceIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Untranslated } from "@/components/ui/Untranslated";
import { usePageActions } from "@/contexts/pageActions";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import type { Tables } from "@/integrations/supabase/types";
import { exportToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/format/formatCurrency";
// hasReachedListLimit ya no es necesario: paginación real vía useInvoicesInfinite.
import { notifySuccess } from "@/lib/ui/appFeedback";
import { formatDateDisplay } from "@/lib/utils";
import { InvoicesActionsBar, InvoicesFiltersBar } from "../components/list/InvoicesToolbar";
import { RecurringInvoicesPreviewDialog } from "../components/recurring/RecurringInvoicesPreviewDialog";
import { RecurringInvoicesResultDialog } from "../components/recurring/RecurringInvoicesResultDialog";
import { useGenerateRecurringInvoices } from "../hooks/invoices/recurring/useGenerateRecurringInvoices";
import { usePreviewRecurringInvoices } from "../hooks/invoices/recurring/usePreviewRecurringInvoices";
import { invoiceQueries, useInvoicesInfinite } from "../hooks/invoices/useInvoices";
import { useInvoicesFilters } from "../hooks/invoices/useInvoicesFilters";

type Invoice = Tables<"invoices">;

function useRecurringHandlers(setPreviewOpen: (o: boolean) => void, setResultOpen: (o: boolean) => void) {
  const generateRecurring = useGenerateRecurringInvoices();
  const previewRecurring = usePreviewRecurringInvoices();

  const openPreview = () => {
    setPreviewOpen(true);
    previewRecurring.mutate();
  };

  const handleConfirm = (bookingIds: string[]) => {
    generateRecurring.mutate(bookingIds, {
      onSuccess: (data) => {
        setPreviewOpen(false);
        setResultOpen(true);
        const count = data?.invoicesCreated ?? 0;
        const failedCount = data?.failed?.length ?? 0;
        if (count > 0) {
          notifySuccess(`${count} factura${count === 1 ? "" : "s"} generada${count === 1 ? "" : "s"}`, {
            description: failedCount > 0 ? `${failedCount} fallida${failedCount === 1 ? "" : "s"}.` : "Borradores creados.",
          });
        }
      },
    });
  };

  const handleRetry = (bookingIds: string[]) => {
    generateRecurring.mutate(bookingIds);
  };

  return { generateRecurring, previewRecurring, openPreview, handleConfirm, handleRetry };
}

function useInvoiceColumns(): ColumnDef<Invoice>[] {
  return [
      { id: "invoice_number", header: "Factura #", accessorKey: "invoice_number",
        cell: ({ row }) => <Untranslated className="font-medium">{row.original.invoice_number}</Untranslated> },
      { id: "customer_name", header: "Cliente", accessorFn: (i) => i.customer_name || "",
        cell: ({ row }) => row.original.customer_name ? <Untranslated>{row.original.customer_name}</Untranslated> : "—" },
      { id: "total", header: "Total", accessorFn: (i) => Number(i.total), meta: { align: "right" },
        cell: ({ row }) => {
          const moneda = (row.original as Invoice & { moneda?: string | null }).moneda ?? "MXN";
          return (
            <span className="font-mono inline-flex items-center gap-1 justify-end">
              {formatCurrency(Number(row.original.total))}
              {moneda !== "MXN" && (
                <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1 rounded">{moneda}</span>
              )}
            </span>
          );
        } },
      { id: "status", header: "Estado", accessorKey: "status",
        cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: "issued_at", header: "Emitida", accessorKey: "issued_at",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDateDisplay(row.original.issued_at)}</span> },
      { id: "due_date", header: "Vencimiento", accessorFn: (i) => i.due_date || "",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDateDisplay(row.original.due_date)}</span> },
      { id: "view", header: "", enableSorting: false, meta: { cellClassName: "w-12" },
        cell: () => <ViewIcon className="h-4 w-4 text-muted-foreground" /> },
    ];
}

function InvoiceCard({ inv, onClick }: { inv: Invoice; onClick: () => void }) {
  return (
    <Card className="cursor-pointer active:scale-[0.98] transition-transform" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <Untranslated className="font-mono font-semibold text-sm">{inv.invoice_number}</Untranslated>
          <StatusBadge status={inv.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {inv.customer_name ? <Untranslated>{inv.customer_name}</Untranslated> : "Sin cliente"}
        </p>
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <div className="text-xs text-muted-foreground">
            <span>{formatDateDisplay(inv.issued_at)}</span>
            {inv.due_date && <span> → {formatDateDisplay(inv.due_date)}</span>}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold font-mono">{formatCurrency(Number(inv.total))}</span>
            <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function InvoicesPage() {
  const {
    search, setSearch, statusFilter, setStatusFilter, cfdiFilter, setCfdiFilter,
    dateRange, setDateRange, queryFilters, filterKey, hasActive, clearAll,
  } = useInvoicesFilters();

  const invoicesQuery = useInvoicesInfinite(queryFilters);
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = invoicesQuery;
  const navigate = useNavigateTransition();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  usePageActions({ onNew: () => navigate("/invoices/new"), newLabel: "Nueva factura" });

  const { generateRecurring, previewRecurring, openPreview, handleConfirm, handleRetry } =
    useRecurringHandlers(setPreviewOpen, setResultOpen);
  const invoiceRows = useMemo(() => data?.pages.flatMap((p) => p.rows) ?? [], [data]);

  const columns = useInvoiceColumns();
  const table = useLiftgoTable<Invoice>({
    data: invoiceRows,
    columns,
    getRowId: (i) => i.id,
    initialSorting: [{ id: "invoice_number", desc: true }],
    resetKey: filterKey,
  });

  const exportCsv = () =>
    exportToCsv("facturas.csv", invoiceRows.map((inv) => ({
      "Factura #": inv.invoice_number, Cliente: inv.customer_name || "", Total: inv.total,
      Estado: inv.status, Emitida: inv.issued_at, Vencimiento: inv.due_date || "",
    })));

  return (
    <>
      <ListPageLayout
        title="Facturas"
        subtitle="Administrar facturación y pagos"
        actions={
          <InvoicesActionsBar
            onOpenPreview={openPreview}
            onExport={exportCsv}
            onNew={() => navigate("/invoices/new")}
            previewPending={previewRecurring.isPending}
          />
        }
        filters={
          <InvoicesFiltersBar
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            cfdiFilter={cfdiFilter}
            setCfdiFilter={setCfdiFilter}
            dateRange={dateRange}
            setDateRange={setDateRange}
            search={search}
            setSearch={setSearch}
            hasActive={hasActive}
            onClear={clearAll}
          />
        }

        isLoading={isLoading}
        isError={isError}
        onRetry={() => { void refetch(); }}
        table={table}
        onRowClick={(inv) => navigate(`/invoices/${inv.id}`)}
        onRowPrefetch={(inv) => invoiceQueries.detail(inv.id)}
        hasActiveFilters={hasActive}
        onClearFilters={clearAll}
        emptyMessage="No se encontraron facturas"
        emptyIcon={InvoiceIcon}
        emptyActionLabel="Nueva Factura"
        onEmptyAction={() => navigate("/invoices/new")}
        skeletonColumns={7}
        mobileCardRender={(inv) => <InvoiceCard inv={inv} onClick={() => navigate(`/invoices/${inv.id}`)} />}
        loadMore={{
          hasMore: !!hasNextPage,
          isLoading: isFetchingNextPage,
          onClick: () => { void fetchNextPage(); },
          loaded: invoiceRows.length,
        }}
      />
      <RecurringInvoicesPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        data={previewRecurring.data}
        isLoading={previewRecurring.isPending}
        isGenerating={generateRecurring.isPending}
        onConfirm={handleConfirm}
      />
      <RecurringInvoicesResultDialog
        open={resultOpen}
        onOpenChange={setResultOpen}
        result={generateRecurring.data}
        onRetry={handleRetry}
        isRetrying={generateRecurring.isPending}
      />
    </>
  );
}
