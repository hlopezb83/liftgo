import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { useInvoices } from "../hooks/invoices/useInvoices";
import { useGenerateRecurringInvoices } from "../hooks/invoices/recurring/useGenerateRecurringInvoices";
import { usePreviewRecurringInvoices } from "../hooks/invoices/recurring/usePreviewRecurringInvoices";
import { RecurringInvoicesPreviewDialog } from "../components/recurring/RecurringInvoicesPreviewDialog";
import { RecurringInvoicesResultDialog } from "../components/recurring/RecurringInvoicesResultDialog";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { useInvoicesFilters } from "../hooks/invoices/useInvoicesFilters";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { SearchBar } from "@/components/forms/SearchBar";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Eye, Download, ChevronRight, RefreshCw, Receipt, X, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { exportToCsv } from "@/lib/exportCsv";
import { STATUS_LABELS } from "@/lib/constants";
import { formatDateDisplay } from "@/lib/utils";
import { RoleGuard } from "@/layouts/RoleGuard";
import { DateRangePickerField } from "@/components/forms/DateRangePickerField";
import { type ColumnDef } from "@/components/dataTable/v2";
import { useResourceList } from "@/hooks/useResourceList";
import { usePageActions } from "@/contexts/pageActions";
import { LIST_PAGE_LIMIT, hasReachedListLimit } from "@/lib/supabase/constants";
import { Untranslated } from "@/components/ui/Untranslated";

const STATUSES = ["all", "draft", "sent", "partial", "paid", "overdue"] as const;

type Invoice = NonNullable<ReturnType<typeof useInvoices>["data"]>[number];

export default function InvoicesPage() {
  const { data: invoices, isLoading } = useInvoices();
  const navigate = useNavigate();
  const generateRecurring = useGenerateRecurringInvoices();
  const previewRecurring = usePreviewRecurringInvoices();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  usePageActions({ onNew: () => navigate("/invoices/new"), newLabel: "Nueva factura" });

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

  const { search, setSearch, statusFilter, setStatusFilter, dateRange, setDateRange, filtered } =
    useInvoicesFilters(invoices);


  const columns = useMemo<ColumnDef<Invoice>[]>(
    () => [
      {
        id: "invoice_number",
        header: "Factura #",
        accessorKey: "invoice_number",
        cell: ({ row }) => <Untranslated className="font-medium">{row.original.invoice_number}</Untranslated>,
      },
      {
        id: "customer_name",
        header: "Cliente",
        accessorFn: (i) => i.customer_name || "",
        cell: ({ row }) =>
          row.original.customer_name ? <Untranslated>{row.original.customer_name}</Untranslated> : "—",
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
      {
        id: "issued_at",
        header: "Emitida",
        accessorKey: "issued_at",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDateDisplay(row.original.issued_at)}</span>,
      },
      {
        id: "due_date",
        header: "Vencimiento",
        accessorFn: (i) => i.due_date || "",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDateDisplay(row.original.due_date)}</span>,
      },
      {
        id: "view",
        header: "",
        enableSorting: false,
        meta: { cellClassName: "w-12" },
        cell: () => <Eye className="h-4 w-4 text-muted-foreground" />,
      },
    ],
    [],
  );

  const { table } = useResourceList<Invoice>({
    items: invoices,
    columns,
    getRowId: (i) => i.id,
    initialSorting: [{ id: "invoice_number", desc: true }],
    externalFiltered: filtered,
  });

  return (
    <>
    <ListPageLayout
      title="Facturas"
      subtitle="Administrar facturación y pagos"
      actions={
        <div className="flex gap-2">
          <RoleGuard module="Facturas" minAccess="full">
            <Button variant="outline" size="sm" onClick={openPreview} disabled={previewRecurring.isPending}>
              <RefreshCw className={`h-4 w-4 mr-1 ${previewRecurring.isPending ? "animate-spin" : ""}`} />
              Generar Recurrentes
            </Button>
          </RoleGuard>
          <Button variant="outline" size="sm" onClick={() => exportToCsv("facturas.csv", filtered.map((inv) => ({ "Factura #": inv.invoice_number, Cliente: inv.customer_name || "", Total: inv.total, Estado: inv.status, Emitida: inv.issued_at, Vencimiento: inv.due_date || "" })))}>
            <Download className="h-4 w-4 mr-1" />Exportar CSV
          </Button>
          <Button size="sm" onClick={() => navigate("/invoices/new")}><Plus className="h-4 w-4 mr-1" />Nueva Factura</Button>
        </div>
      }
      filters={
        <div className="space-y-3">
          {hasReachedListLimit(invoices) && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Mostrando los primeros {LIST_PAGE_LIMIT} registros. Refina los filtros para ver más.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList className="flex-nowrap overflow-x-auto w-full sm:w-auto">
                {STATUSES.map((s) => (
                  <TabsTrigger key={s} value={s}>{STATUS_LABELS[s] || s}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center w-full sm:w-auto">
              <div className="w-full sm:w-64">
                <DateRangePickerField
                  label=""
                  dateRange={dateRange}
                  onSelect={setDateRange}
                  placeholder="Filtrar por fecha de emisión"
                />
              </div>
              {(dateRange?.from || dateRange?.to) && (
                <Button variant="ghost" size="sm" onClick={() => setDateRange(undefined)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
              <SearchBar value={search} onChange={setSearch} placeholder="Buscar facturas…" className="w-full sm:w-64" />
            </div>
          </div>
        </div>
      }
      isLoading={isLoading}
      table={table}
      onRowClick={(inv) => navigate(`/invoices/${inv.id}`)}
      emptyMessage="No se encontraron facturas"
      emptyIcon={Receipt}
      emptyActionLabel="Nueva Factura"
      onEmptyAction={() => navigate("/invoices/new")}
      skeletonColumns={7}
      mobileCardRender={(inv) => (
        <Card className="cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate(`/invoices/${inv.id}`)}>
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
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
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

