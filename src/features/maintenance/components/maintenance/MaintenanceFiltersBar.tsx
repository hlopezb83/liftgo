import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ForkliftOption { id: string; name: string }

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  forkliftFilter: string;
  onForkliftFilterChange: (v: string) => void;
  forklifts: ForkliftOption[] | undefined;
  hasActive?: boolean;
  onClear?: () => void;
}

export function MaintenanceFiltersBar({
  search,
  onSearchChange,
  forkliftFilter,
  onForkliftFilterChange,
  forklifts,
  hasActive,
  onClear,
}: Props) {
  return (
    <FiltersToolbar>
      <FiltersToolbar.Search
        value={search}
        onChange={onSearchChange}
        placeholder="Buscar por servicio, técnico..."
      />
      <Select value={forkliftFilter || "all"} onValueChange={onForkliftFilterChange}>
        <SelectTrigger className="w-full sm:w-[200px] h-9">
          <SelectValue placeholder="Todos los montacargas" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los montacargas</SelectItem>
          {forklifts?.map((f) => (
            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {onClear && (
        <FiltersToolbar.ClearAll visible={!!hasActive} onClick={onClear} />
      )}
    </FiltersToolbar>
  );
}
