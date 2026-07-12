import { DateRangePickerField } from "@/components/forms/DateRangePickerField";
import { SearchBar } from "@/components/forms/SearchBar";
import { AddIcon, DownloadIcon, RefreshIcon, X, WarnIcon } from "@/components/icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoleGuard } from "@/layouts/RoleGuard";
import { STATUS_LABELS } from "@/lib/constants";
import { LIST_PAGE_LIMIT } from "@/lib/supabase/constants";
import type { DateRange } from "react-day-picker";

const INVOICE_STATUSES = ["all", "draft", "sent", "partial", "paid", "overdue"] as const;

interface ActionsProps {
  onOpenPreview: () => void;
  onExport: () => void;
  onNew: () => void;
  previewPending: boolean;
}

export function InvoicesActionsBar({ onOpenPreview, onExport, onNew, previewPending }: ActionsProps) {
  return (
    <div className="flex gap-2">
      <RoleGuard module="Facturas" minAccess="full">
        <Button variant="outline" size="sm" onClick={onOpenPreview} disabled={previewPending}>
          <RefreshIcon className={`h-4 w-4 mr-1 ${previewPending ? "animate-spin" : ""}`} />
          Generar Recurrentes
        </Button>
      </RoleGuard>
      <Button variant="outline" size="sm" onClick={onExport}>
        <DownloadIcon className="h-4 w-4 mr-1" />Exportar CSV
      </Button>
      <Button size="sm" onClick={onNew}><AddIcon className="h-4 w-4 mr-1" />Nueva Factura</Button>
    </div>
  );
}

interface FiltersProps {
  reachedLimit: boolean;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  dateRange: DateRange | undefined;
  setDateRange: (r: DateRange | undefined) => void;
  search: string;
  setSearch: (v: string) => void;
}

export function InvoicesFiltersBar({
  reachedLimit, statusFilter, setStatusFilter, dateRange, setDateRange, search, setSearch,
}: FiltersProps) {
  return (
    <div className="space-y-3">
      {reachedLimit && (
        <Alert>
          <WarnIcon className="h-4 w-4" />
          <AlertDescription>
            Mostrando los primeros {LIST_PAGE_LIMIT} registros. Refina los filtros para ver más.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="flex-nowrap overflow-x-auto w-full sm:w-auto">
            {INVOICE_STATUSES.map((s) => (
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
  );
}
