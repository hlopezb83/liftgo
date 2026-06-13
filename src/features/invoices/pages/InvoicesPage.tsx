import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { useInvoices } from "../hooks/invoices/useInvoices";
import { useGenerateRecurringInvoices } from "../hooks/invoices/recurring/useGenerateRecurringInvoices";
import { useInvoicesFilters } from "../hooks/invoices/useInvoicesFilters";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { SearchBar } from "@/components/forms/SearchBar";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Eye, Download, ChevronRight, RefreshCw, Receipt, X } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { STATUS_LABELS } from "@/lib/constants";
import { formatDateDisplay } from "@/lib/utils";
import { RoleGuard } from "@/layouts/RoleGuard";
import { DateRangePickerField } from "@/components/forms/DateRangePickerField";
import { type ColumnDef } from "@/components/dataTable/v2";
import { useResourceList } from "@/hooks/useResourceList";
import { usePageActions } from "@/contexts/pageActions";

const STATUSES = ["all", "draft", "sent", "partial", "paid", "overdue"] as const;

type Invoice = NonNullable<ReturnType<typeof useInvoices>["data"]>[number];

export default function InvoicesPage() {
  const { data: invoices, isLoading } = useInvoices();
  const navigate = useNavigate();
  const generateRecurring = useGenerateRecurringInvoices();
  usePageActions({ onNew: () => navigate("/invoices/new"), newLabel: "Nueva factura" });

  const { search, setSearch, statusFilter, setStatusFilter, dateRange, setDateRange, filtered } =
    useInvoicesFilters(invoices);

  const columns = useMemo<ColumnDef<Invoice>[]>(
    () => [
      {
        id: "invoice_number",
        header: "Factura #",
        accessorKey: "invoice_number",
        cell: ({ row }) => <span className="font-medium">{row.original.invoice_number}</span>,
      },
      {
        id: "customer_name",
        header: "Cliente",
        accessorFn: (i) => i.customer_name || "",
        cell: ({ row }) => row.original.customer_name || "—",
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
    <ListPageLayout
      title="Facturas"
      subtitle="Administrar facturación y pagos"
      actions={
        <div className="flex gap-2">
          <RoleGuard module="Facturas" minAccess="full">
            <Button variant="outline" size="sm" onClick={() => generateRecurring.mutate()} disabled={generateRecurring.isPending}>
              <RefreshCw className={`h-4 w-4 mr-1 ${generateRecurring.isPending ? "animate-spin" : ""}`} />
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
              <span className="font-mono font-semibold text-sm">{inv.invoice_number}</span>
              <StatusBadge status={inv.status} />
            </div>
            <p className="text-sm text-muted-foreground">{inv.customer_name || "Sin cliente"}</p>
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
  );
}
