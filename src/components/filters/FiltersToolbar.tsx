import { isValid } from "date-fns";
import { DateRangePickerField } from "@/components/forms/DateRangePickerField";
import { SearchBar } from "@/components/forms/SearchBar";
import { CloseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toYMD } from "@/lib/date/toYMD";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import type { DateRange } from "react-day-picker";


/**
 * Toolbar de filtros canónica.
 *
 * Convenciones de UX (v7.62.0):
 * - Los filtros van en una sola fila responsive (wrap en móvil).
 * - Búsqueda a la izquierda, facetas en el centro, "Limpiar" a la derecha.
 * - Status con ≤5 opciones → `<Tabs>`; con >5 → `<Select>`.
 * - El botón "Limpiar filtros" sólo aparece si hay filtros activos.
 */

interface RootProps {
  children: ReactNode;
  className?: string;
}

function Root({ children, className }: RootProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface SearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function Search({ value, onChange, placeholder, className }: SearchProps) {
  return (
    <SearchBar
      value={value}
      onChange={onChange}
      placeholder={placeholder ?? "Buscar…"}
      className={className ?? "w-full sm:w-64"}
      data-testid="filters-search"
    />
  );
}

interface StatusTabsProps<V extends string> {
  value: V | "all";
  onChange: (value: V | "all") => void;
  options: readonly { value: V | "all"; label: string }[];
  className?: string;
}

function StatusTabs<V extends string>({
  value,
  onChange,
  options,
  className,
}: StatusTabsProps<V>) {
  return (
    <Tabs
      value={value}
      onValueChange={(v) => onChange(v as V | "all")}
      className={cn("w-full sm:w-auto overflow-x-auto", className)}
    >
      <TabsList className="whitespace-nowrap">
        {options.map((opt) => (
          <TabsTrigger
            key={opt.value}
            value={opt.value}
            className="data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:ring-1 data-[state=active]:ring-border"
          >
            {opt.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

interface StatusSelectProps<V extends string> {
  value: V | "all";
  onChange: (value: V | "all") => void;
  options: readonly { value: V | "all"; label: string }[];
  placeholder?: string;
  className?: string;
}

function StatusSelect<V extends string>({
  value,
  onChange,
  options,
  placeholder,
  className,
}: StatusSelectProps<V>) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as V | "all")}>
      <SelectTrigger className={cn("w-full sm:w-48", className)}>
        <SelectValue placeholder={placeholder ?? "Todos"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface ClearAllProps {
  onClick: () => void;
  visible: boolean;
  label?: string;
}

function ClearAll({ onClick, visible, label }: ClearAllProps) {
  if (!visible) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground gap-1.5 ml-auto"
    >
      <CloseIcon className="h-3.5 w-3.5" />
      {label ?? "Limpiar filtros"}
    </Button>
  );
}

interface DateRangeControlProps {
  /** Valor serializado como "from..to" (compatible con facet `dateRange` de useTableFilters). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Wrapper de `DateRangePickerField` para el toolbar canónico.
 * Serializa/deserializa el string `"YYYY-MM-DD..YYYY-MM-DD"` que consume
 * el hook `useTableFilters` en su facet `dateRange`.
 */
function DateRangeControl({ value, onChange, placeholder, className }: DateRangeControlProps) {
  const [fromStr, toStr] = value.includes("..") ? value.split("..", 2) : ["", ""];
  // Parsear como fecha local (no UTC) para evitar shift de zona horaria en el
  // round-trip con `toYMD` (America/Monterrey). Ver v7.80.0 changelog.
  // Parsear como mediodía UTC para que `toZonedTime(...,'America/Monterrey')`
  // — usado por el renderer del rango — devuelva siempre el mismo día
  // independientemente de la zona horaria del navegador. Round-trip seguro con `toYMD`.
  const parseYMD = (s: string): Date | undefined => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return undefined;
    const [, y, mo, d] = m;
    const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12, 0, 0));
    return isValid(dt) ? dt : undefined;
  };
  const from = parseYMD(fromStr);
  const to = parseYMD(toStr);
  const dateRange: DateRange | undefined = from || to ? { from, to } : undefined;

  return (
    <div className={cn("w-full sm:w-64", className)}>
      <DateRangePickerField
        label=""
        dateRange={dateRange}
        onSelect={(r) => {
          const f = r?.from ? toYMD(r.from) : "";
          const t = r?.to ? toYMD(r.to) : "";
          onChange(f || t ? `${f}..${t}` : "");
        }}
        placeholder={placeholder ?? "Filtrar por fecha"}
      />
    </div>
  );
}

export const FiltersToolbar = Object.assign(Root, {
  Search,
  StatusTabs,
  StatusSelect,
  DateRange: DateRangeControl,
  ClearAll,
});


