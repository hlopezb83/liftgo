import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { DateRangePickerField } from "@/components/forms/DateRangePickerField";
import { AddIcon, DownloadIcon, RefreshIcon, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RoleGuard } from "@/layouts/RoleGuard";
import { STATUS_LABELS } from "@/lib/constants";
import { INVOICE_CFDI_FILTERS, INVOICE_CFDI_LABELS, INVOICE_STATUS_FILTERS } from "../../lib/invoiceListFilters";
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
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  cfdiFilter: string;
  setCfdiFilter: (v: string) => void;
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
  statusFilter,
  setStatusFilter,
  cfdiFilter,
  setCfdiFilter,
  dateRange,
  setDateRange,
  search,
  setSearch,
  hasActive,
  onClear,
}: FiltersProps) {
  return (
    <div className="space-y-3">
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
        <div className="w-full sm:w-48">
          <Select value={cfdiFilter} onValueChange={setCfdiFilter}>
            <SelectTrigger aria-label="Filtrar por estado CFDI">
              <SelectValue placeholder="Estado CFDI" />
            </SelectTrigger>
            <SelectContent>
              {INVOICE_CFDI_FILTERS.map((v) => (
                <SelectItem key={v} value={v}>
                  CFDI: {INVOICE_CFDI_LABELS[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
