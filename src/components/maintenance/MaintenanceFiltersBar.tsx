import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchBar } from "@/components/SearchBar";

interface ForkliftOption { id: string; name: string }

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  forkliftFilter: string;
  onForkliftFilterChange: (v: string) => void;
  forklifts: ForkliftOption[] | undefined;
}

export function MaintenanceFiltersBar({
  search, onSearchChange, forkliftFilter, onForkliftFilterChange, forklifts,
}: Props) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <SearchBar value={search} onChange={onSearchChange} placeholder="Buscar por servicio, técnico..." />
      <Select value={forkliftFilter} onValueChange={onForkliftFilterChange}>
        <SelectTrigger className="w-full sm:w-[200px]">
          <SelectValue placeholder="Todos los montacargas" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los montacargas</SelectItem>
          {forklifts?.map((f) => (
            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
