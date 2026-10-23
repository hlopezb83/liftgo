
import { useEffect, useMemo, useState } from "react";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { ViewIcon, InvoiceIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Untranslated } from "@/components/ui/Untranslated";
import { usePageActions } from "@/contexts/pageActions";
import { useHasModuleAccess } from "@/features/users";
import { useTableViewState } from "@/hooks/filters/useTableViewState";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { useLocation } from "@/lib/router-compat";
// hasReachedListLimit ya no es necesario: paginación real vía useInvoicesInfinite.
import { notifySuccess } from "@/lib/ui/appFeedback";
import { InvoiceMobileCard } from "../components/list/InvoiceMobileCard";
import { InvoicesActionsBar, InvoicesFiltersBar } from "../components/list/InvoicesToolbar";
import { RecurringInvoicesPreviewDialog } from "../components/recurring/RecurringInvoicesPreviewDialog";
import { RecurringInvoicesResultDialog } from "../components/recurring/RecurringInvoicesResultDialog";
import { useGenerateRecurringInvoices } from "../hooks/invoices/recurring/useGenerateRecurringInvoices";
import { usePreviewRecurringInvoices } from "../hooks/invoices/recurring/usePreviewRecurringInvoices";
import { useInvoiceCsvExport } from "../hooks/invoices/useInvoiceCsvExport";
import { invoiceQueries, useInvoicesInfinite, type InvoiceListItem } from "../hooks/invoices/useInvoices";
import { useInvoicesFilters } from "../hooks/invoices/useInvoicesFilters";

type Invoice = InvoiceListItem;

function useRecurringHandlers(setPreviewOpen: (o: boolean) => void, setResultOpen: (o: boolean) => void) {
  const generateRecurring = useGenerateRecurringInvoices({ onShowDetails: () => setResultOpen(true) });
  const previewRecurring = usePreviewRecurringInvoices();

  const openPreview = () => {
    setPreviewOpen(true);
    previewRecurring.mutate();
  };

  const handleConfirm = (
    selections: Array<{ bookingId: string; periodStart: string }>,
    allowStaleRate = false,
  ) => {
    generateRecurring.mutate({ selections, allowStaleRate }, {
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
    generateRecurring.mutate({ bookingIds });
  };

  return { generateRecurring, previewRecurring, openPreview, handleConfirm, handleRetry };
}

function useInvoiceColumns(): ColumnDef<Invoice>[] {
  return [
      { id: "invoice_number", header: "Factura #", accessorKey: "invoice_number",
        cell: ({ row }) => <Untranslated className="font-medium">{row.original.invoice_number}</Untranslated> },
      { id: "customer_name", header: "Cliente", accessorFn: (i) => i.customer_name,
        cell: ({ row }) => row.original.customer_name ? <Untranslated>{row.original.customer_name}</Untranslated> : "—" },
      { id: "total", header: "Total", accessorFn: (i) => Number(i.total), meta: { kind: "money" },
        cell: ({ row }) => {
          const moneda = row.original.moneda ?? "MXN";
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
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDateMty(row.original.issued_at)}</span> },
      { id: "due_date", header: "Vencimiento", accessorFn: (i) => i.due_date,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDateMty(row.original.due_date)}</span> },
      { id: "view", header: "", enableSorting: false, meta: { cellClassName: "w-12" },
        cell: () => <ViewIcon className="h-4 w-4 text-muted-foreground" /> },
    ];
}

export default function InvoicesPage() {
  const location = useLocation();
  const {
    search, setSearch, statusFilter, setStatusFilter, cfdiFilter, setCfdiFilter,
    dateRange, setDateRange, queryFilters, filterKey, hasActive, clearAll,
  } = useInvoicesFilters();

  const tableViewState = useTableViewState(undefined, [{ id: "invoice_number", desc: true }]);
  const sorting = tableViewState.controlledSorting;
  const invoicesQuery = useInvoicesInfinite(queryFilters, sorting);
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = invoicesQuery;
  const isUpdatingFilters = invoicesQuery.isPlaceholderData;
  const invoiceRows = useMemo(() => data?.pages.flatMap((p) => p.rows) ?? [], [data]);
  const navigate = useNavigateTransition();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const canCreate = useHasModuleAccess("Facturas", "full");
  const csvExport = useInvoiceCsvExport(queryFilters);
  const showExport = csvExport.allowed && !isUpdatingFilters && (invoiceRows.length > 0 || !!hasNextPage);
  const showHeaderNew = isLoading || isError || hasActive || showExport;
  usePageActions({ onNew: canCreate ? () => navigate("/invoices/new") : undefined, newLabel: "Nueva factura" });

  const { generateRecurring, previewRecurring, openPreview, handleConfirm, handleRetry } =
    useRecurringHandlers(setPreviewOpen, setResultOpen);

  const columns = useInvoiceColumns();
  const table = useLiftgoTable<Invoice>({
    data: isUpdatingFilters ? [] : invoiceRows,
    columns,
    getRowId: (i) => i.id,
    ...tableViewState,
    controlledPagination: {
      ...tableViewState.controlledPagination,
      pageIndex: Math.min(tableViewState.controlledPagination.pageIndex,
        Math.max(0, Math.ceil(invoiceRows.length / tableViewState.controlledPagination.pageSize) - 1)),
    },
    manualSorting: true,
    resetKey: `${filterKey}|${JSON.stringify(sorting)}`,
    preservePaginationOnAppend: true,
  });

  // A crafted or expired page URL must not trigger a crawl of every remote page.
  // Restore only rows already available for this query; normal end-of-page loading remains below.
  const restoredMaxPage = Math.max(0, Math.ceil(invoiceRows.length / tableViewState.controlledPagination.pageSize) - 1);
  const requestedPage = tableViewState.controlledPagination.pageIndex;
  const requestedSize = tableViewState.controlledPagination.pageSize;
  const clampRestoredPage = tableViewState.onControlledPaginationChange;
  useEffect(() => {
    if (!isLoading && !isUpdatingFilters && !isError && requestedPage > restoredMaxPage) {
      clampRestoredPage({ pageIndex: restoredMaxPage, pageSize: requestedSize });
    }
  }, [isLoading, isUpdatingFilters, isError, requestedPage, restoredMaxPage, requestedSize, clampRestoredPage]);

  // Hallazgo 2: convivían dos paginaciones (páginas + "Cargar más"); se
  // conserva sólo la paginación por páginas. La siguiente página del servidor
  // se pide SOLO cuando el usuario llega a la última página ya cargada
  // (QA: antes se descargaba todo el historial en cadena al montar/filtrar).
  // Cambiar filtros/búsqueda reinicia la queryKey (página 0).
  const { pageIndex, pageSize } = table.state.pagination;
  const reachedLoadedEnd = (pageIndex + 1) * pageSize >= invoiceRows.length;
  useEffect(() => {
    if (reachedLoadedEnd && hasNextPage && !isFetchingNextPage && !isError && !isUpdatingFilters) void fetchNextPage();
  }, [reachedLoadedEnd, hasNextPage, isFetchingNextPage, isError, isUpdatingFilters, fetchNextPage]);


  return (
    <>
      <ListPageLayout
        title="Facturas"
        subtitle="Administrar facturación y pagos"
        actions={(canCreate || showExport) &&
          <InvoicesActionsBar
            onOpenPreview={openPreview}
            onExport={() => { void csvExport.download(); }}
            exportPending={csvExport.busy}
            onNew={() => navigate("/invoices/new")}
            previewPending={previewRecurring.isPending}
            showExport={showExport}
            showNew={showHeaderNew}
          />
        }
        stackedControls
        search={<FiltersToolbar.Search value={search} onChange={setSearch} placeholder="Buscar facturas…" className="w-full sm:w-64 sm:flex-none" />}
        filters={
          <InvoicesFiltersBar
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            cfdiFilter={cfdiFilter}
            setCfdiFilter={setCfdiFilter}
            dateRange={dateRange}
            setDateRange={setDateRange}
            hasActive={hasActive}
            onClear={clearAll}
          />
        }

        isLoading={isLoading || isUpdatingFilters}
        isError={isError}
        onRetry={() => { void refetch(); }}
        table={table}
        onRowClick={(inv) => navigate(`/invoices/${inv.id}`, {
          state: { invoiceListBackTo: `${location.pathname}${location.search}${location.hash}` },
        })}
        onRowPrefetch={(inv) => invoiceQueries.detail(inv.id)}
        hasMoreRows={!!hasNextPage}
        hasActiveFilters={hasActive}
        onClearFilters={clearAll}
        emptyMessage="No se encontraron facturas"
        emptyIcon={InvoiceIcon}
        emptyActionLabel={canCreate ? "Nueva factura" : undefined}
        onEmptyAction={canCreate ? () => navigate("/invoices/new") : undefined}
        skeletonColumns={7}
        mobileCardRender={(inv) => <InvoiceMobileCard inv={inv} />}
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
