import { Search, X, LayoutGrid, Rows3, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CRMHeaderKPIs } from "@/components/crm/CRMHeaderKPIs";
import { VALUE_RANGE_OPTIONS, AGE_RANGE_OPTIONS } from "@/lib/constants/crm";
import type { CRMFilters, ValueRange, AgeRange } from "@/hooks/crm/useCRMFilters";
import type { CRMMetrics } from "@/hooks/crm/useCRMMetrics";

interface CRMToolbarProps {
  filters: CRMFilters;
  update: <K extends keyof CRMFilters>(key: K, value: CRMFilters[K]) => void;
  reset: () => void;
  hasActive: boolean;
  creators: [string, string][];
  density: "comfortable" | "compact";
  setDensity: (d: "comfortable" | "compact") => void;
  metrics: CRMMetrics | undefined;
  onCreate: () => void;
  filteredCount: number;
  pipelineTotalLabel: string;
}

export function CRMToolbar({
  filters, update, reset, hasActive, creators,
  density, setDensity, metrics, onCreate,
  filteredCount, pipelineTotalLabel,
}: CRMToolbarProps) {
  return (
    <div className="px-6 py-3 border-b bg-card space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline CRM</h1>
          <p className="text-xs text-muted-foreground">
            {filteredCount} prospecto{filteredCount === 1 ? "" : "s"} · {pipelineTotalLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={density}
            onValueChange={(v) => v && setDensity(v as "comfortable" | "compact")}
            size="sm"
            variant="outline"
          >
            <ToggleGroupItem value="comfortable" aria-label="Cómodo" className="h-9 px-2">
              <Tooltip>
                <TooltipTrigger asChild><LayoutGrid className="h-4 w-4" /></TooltipTrigger>
                <TooltipContent>Vista cómoda</TooltipContent>
              </Tooltip>
            </ToggleGroupItem>
            <ToggleGroupItem value="compact" aria-label="Compacto" className="h-9 px-2">
              <Tooltip>
                <TooltipTrigger asChild><Rows3 className="h-4 w-4" /></TooltipTrigger>
                <TooltipContent>Vista compacta</TooltipContent>
              </Tooltip>
            </ToggleGroupItem>
          </ToggleGroup>
          <Button onClick={onCreate} size="sm" className="h-9">
            <Plus className="h-4 w-4 mr-1" /> Nuevo Prospecto
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => update("search", e.target.value)}
            placeholder="Buscar empresa o contacto…"
            className="h-8 pl-8 text-sm"
          />
        </div>

        {creators.length > 0 && (
          <Select value={filters.creator} onValueChange={(v) => update("creator", v)}>
            <SelectTrigger className="w-[170px] h-8 text-sm">
              <SelectValue placeholder="Creador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los usuarios</SelectItem>
              {creators.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={filters.valueRange} onValueChange={(v) => update("valueRange", v as ValueRange)}>
          <SelectTrigger className="w-[160px] h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {VALUE_RANGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.ageRange} onValueChange={(v) => update("ageRange", v as AgeRange)}>
          <SelectTrigger className="w-[170px] h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {AGE_RANGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActive && (
          <Button variant="ghost" size="sm" onClick={reset} className="h-8 text-xs">
            <X className="h-3.5 w-3.5 mr-1" /> Limpiar
          </Button>
        )}

        <div className="ml-auto">
          <CRMHeaderKPIs metrics={metrics} />
        </div>
      </div>
    </div>
  );
}
