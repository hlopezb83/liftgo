import { useNavigate } from "react-router-dom";
import { useInvoices } from "@/hooks/useInvoices";
import { useGenerateRecurringInvoices } from "@/hooks/useGenerateRecurringInvoices";
import { formatCurrency } from "@/lib/formatCurrency";
import { useListFilters } from "@/hooks/useListFilters";
import { useListPage } from "@/hooks/useListPage";
import { ListPageLayout } from "@/components/ListPageLayout";
import { MobileCardList } from "@/components/MobileCardList";
import { SearchBar } from "@/components/SearchBar";
import { StatusBadge } from "@/components/StatusBadge";
import { SortableTableHead } from "@/components/SortableTableHead";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { TableRow, TableCell, TableHead } from "@/components/ui/table";
import { Plus, Eye, Download, ChevronRight, RefreshCw, Receipt, X } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { STATUS_LABELS } from "@/lib/constants";
import { formatDateDisplay } from "@/lib/utils";
import { RoleGuard } from "@/components/RoleGuard";
import { DateRangePickerField } from "@/components/DateRangePickerField";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";

const STATUSES = ["all", "draft", "sent", "partial", "paid", "overdue"] as const;

export default function InvoicesPage() {
  const { data: invoices, isLoading } = useInvoices();
  const navigate = useNavigate();
  const generateRecurring = useGenerateRecurringInvoices();

  const { search, setSearch, statusFilter, setStatusFilter, filtered: baseFiltered } = useListFilters(invoices, {
    searchFields: ["invoice_number", "customer_name"],
    statusField: "status",
    skipStatusValues: ["overdue"],
  });

  const filtered = useMemo(() => {
    if (statusFilter !== "overdue") return baseFiltered;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (baseFiltered || []).filter((inv) => {
      if (!inv.due_date) return false;
      if (!["sent", "partial"].includes(inv.status)) return false;
      return parseISO(inv.due_date) < today;
    });
  }, [baseFiltered, statusFilter]);

  const [searchParams, setSearchParams] = useSearchParams();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const dateRange = useMemo(() => {
    if (!fromParam && !toParam) return undefined;
    return {
      from: fromParam ? parseISO(fromParam) : undefined,
      to: toParam ? parseISO(toParam) : undefined,
    };
  }, [fromParam, toParam]);

  const setDateRange = (range?: { from?: Date; to?: Date }) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (range?.from) next.set("from", range.from.toISOString().slice(0, 10));
      else next.delete("from");
      if (range?.to) next.set("to", range.to.toISOString().slice(0, 10));
      else next.delete("to");
      return next;
    }, { replace: true });
  };

  const dateFiltered = useMemo(() => {
    if (!filtered) return filtered;
    if (!dateRange?.from && !dateRange?.to) return filtered;
    const start = dateRange.from ? startOfDay(dateRange.from) : new Date(-8640000000000000);
    const end = dateRange.to ? endOfDay(dateRange.to) : new Date(8640000000000000);
    return filtered.filter((inv) => {
      if (!inv.issued_at) return false;
      return isWithinInterval(parseISO(inv.issued_at), { start, end });
    });
  }, [filtered, dateRange]);

  const { sortKey, sortDirection, toggleSort, page, setPage, totalPages, paginatedItems, isMobile } = useListPage(dateFiltered, {
    defaultSortKey: "invoice_number",
    defaultSortDirection: "desc",
    accessors: {
      invoice_number: (i) => i.invoice_number,
      customer_name: (i) => i.customer_name || "",
      total: (i) => Number(i.total),
      status: (i) => i.status,
      issued_at: (i) => i.issued_at,
      due_date: (i) => i.due_date || "",
    },
  });

  const mobileContent = isMobile ? (
    <MobileCardList
      items={paginatedItems}
      keyExtractor={(inv) => inv.id}
      emptyMessage="No se encontraron facturas"
      renderCard={(inv) => (
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
  ) : undefined;

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
          <Button variant="outline" size="sm" onClick={() => exportToCsv("facturas.csv", (dateFiltered || []).map(inv => ({ "Factura #": inv.invoice_number, Cliente: inv.customer_name || "", Total: inv.total, Estado: inv.status, Emitida: inv.issued_at, Vencimiento: inv.due_date || "" })))}><Download className="h-4 w-4 mr-1" />Exportar CSV</Button>
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
      items={paginatedItems}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
      emptyMessage="No se encontraron facturas"
      emptyIcon={Receipt}
      emptyActionLabel="Nueva Factura"
      onEmptyAction={() => navigate("/invoices/new")}
      tableHeader={
        <TableRow>
          <SortableTableHead sortKey="invoice_number" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Factura #</SortableTableHead>
          <SortableTableHead sortKey="customer_name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Cliente</SortableTableHead>
          <SortableTableHead sortKey="total" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort} className="text-right">Total</SortableTableHead>
          <SortableTableHead sortKey="status" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Estado</SortableTableHead>
          <SortableTableHead sortKey="issued_at" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Emitida</SortableTableHead>
          <SortableTableHead sortKey="due_date" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Vencimiento</SortableTableHead>
          <TableHead className="w-12" />
        </TableRow>
      }
      renderRow={(inv) => (
        <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50 transition-colors duration-150 border-l-2 border-transparent hover:border-primary" onClick={() => navigate(`/invoices/${inv.id}`)}>
          <TableCell className="font-medium">{inv.invoice_number}</TableCell>
          <TableCell>{inv.customer_name || "—"}</TableCell>
          <TableCell className="text-right font-mono">{formatCurrency(Number(inv.total))}</TableCell>
          <TableCell><StatusBadge status={inv.status} /></TableCell>
          <TableCell className="text-sm text-muted-foreground">{formatDateDisplay(inv.issued_at)}</TableCell>
          <TableCell className="text-sm text-muted-foreground">{formatDateDisplay(inv.due_date)}</TableCell>
          <TableCell><Eye className="h-4 w-4 text-muted-foreground" /></TableCell>
        </TableRow>
      )}
      customContent={mobileContent}
      skeletonColumns={7}
    />
  );
}
