import { SearchIcon, X, LayoutGrid, Rows3, AddIcon, FilterIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { VALUE_RANGE_OPTIONS, AGE_RANGE_OPTIONS } from "../lib/constants";
import { CRMHeaderKPIs } from "./CRMHeaderKPIs";
import type { CRMFilters, ValueRange, AgeRange } from "../hooks/useCRMFilters";
import type { CRMMetrics } from "../hooks/useCRMMetrics";

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
  const isMobile = useIsMobile();

  const activeCount =
    (filters.creator !== "all" ? 1 : 0) +
    (filters.valueRange !== "all" ? 1 : 0) +
    (filters.ageRange !== "all" ? 1 : 0);

  const secondaryFilters = (
    <>
      {creators.length > 0 && (
        <Select value={filters.creator} onValueChange={(v) => update("creator", v)}>
          <SelectTrigger className="w-full sm:w-[170px] h-8 text-sm">
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
        <SelectTrigger className="w-full sm:w-[160px] h-8 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {VALUE_RANGE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.ageRange} onValueChange={(v) => update("ageRange", v as AgeRange)}>
        <SelectTrigger className="w-full sm:w-[170px] h-8 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {AGE_RANGE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );

  return (
    <div className="px-4 sm:px-6 py-3 border-b bg-card space-y-3">
      <PageHeader
        title="Pipeline CRM"
        subtitle={`${filteredCount} prospecto${filteredCount === 1 ? "" : "s"} · ${pipelineTotalLabel}`}
        actions={
          <>
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
              <AddIcon className="h-4 w-4 mr-1" /> Nuevo Prospecto
            </Button>
          </>
        }
      />


      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 sm:flex-none sm:w-64 min-w-[180px]">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => update("search", e.target.value)}
            placeholder="Buscar…"
            className="h-8 pl-8 text-sm"
          />
        </div>

        {isMobile ? (
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-2">
                <FilterIcon className="h-3.5 w-3.5" />
                Filtros
                {activeCount > 0 && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{activeCount}</Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
              <SheetHeader className="text-left">
                <SheetTitle>Filtros</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3">{secondaryFilters}</div>
            </SheetContent>
          </Sheet>
        ) : (
          secondaryFilters
        )}

        {hasActive && (
          <Button variant="ghost" size="sm" onClick={reset} className="h-8 text-xs">
            <X className="h-3.5 w-3.5 mr-1" /> Limpiar
          </Button>
        )}

        {metrics && !isMobile && (
          <div className="ml-auto">
            <CRMHeaderKPIs metrics={metrics} />
          </div>
        )}
      </div>
    </div>
  );
}
