import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { DateRangePickerField } from "@/components/forms/DateRangePickerField";
import { AddIcon, DownloadIcon, RefreshIcon, X, WarnIcon } from "@/components/icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RoleGuard } from "@/layouts/RoleGuard";
import { STATUS_LABELS } from "@/lib/constants";
import { LIST_PAGE_LIMIT } from "@/lib/supabase/constants";
import { INVOICE_STATUS_FILTERS } from "../../lib/invoiceListFilters";
import type { DateRange } from "react-day-picker";

interface ActionsProps {
  onOpenPreview: () => void;
  onExport: () => void;
  onNew: () => void;
  previewPending: boolean;
}

export function InvoicesActionsBar({ onOpenPreview, onExport, onNew, previewPending }: ActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <RoleGuard module="Facturas" minAccess="full" fallback={null}>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenPreview}
          disabled={previewPending}
          aria-label="Generar recurrentes"
          title="Generar recurrentes"
        >
          <RefreshIcon className={`h-4 w-4 sm:mr-1 ${previewPending ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Generar Recurrentes</span>
        </Button>
      </RoleGuard>
      <Button variant="outline" size="sm" onClick={onExport} aria-label="Exportar CSV" title="Exportar CSV">
        <DownloadIcon className="h-4 w-4 sm:mr-1" />
        <span className="hidden sm:inline">Exportar CSV</span>
      </Button>
      <RoleGuard module="Facturas" minAccess="full" fallback={null}>
        <Button size="sm" onClick={onNew}><AddIcon className="h-4 w-4 mr-1" />Nueva Factura</Button>
      </RoleGuard>
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
  hasActive: boolean;
  onClear: () => void;
}

const STATUS_OPTIONS = INVOICE_STATUS_FILTERS.map((s) => ({
  value: s,
  label: STATUS_LABELS[s] ?? s,
}));

export function InvoicesFiltersBar({
  reachedLimit,
  statusFilter,
  setStatusFilter,
  dateRange,
  setDateRange,
  search,
  setSearch,
  hasActive,
  onClear,
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
      <FiltersToolbar>
        <FiltersToolbar.Search
          value={search}
          onChange={setSearch}
          placeholder="Buscar facturas…"
        />
        <FiltersToolbar.StatusTabs
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_OPTIONS}
        />
        <div className="flex items-center gap-1">
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
        </div>
        <FiltersToolbar.ClearAll visible={hasActive} onClick={onClear} />
      </FiltersToolbar>
    </div>
  );
}
