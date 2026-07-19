import { AddIcon, DownloadIcon, List, LayoutGrid, RefreshIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RoleGuard } from "@/layouts/RoleGuard";

type Props = {
  viewMode: "list" | "board";
  onViewModeChange: (mode: "list" | "board") => void;
  onExport: () => void;
  onGenerateRecurring: () => void;
  isGenerating: boolean;
  onCreate: () => void;
};

export function MaintenancePageActions({
  viewMode,
  onViewModeChange,
  onExport,
  onGenerateRecurring,
  isGenerating,
  onCreate,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(v) => v && onViewModeChange(v as "list" | "board")}
        size="sm"
      >
        <ToggleGroupItem value="list" aria-label="Vista de lista">
          <List className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="board" aria-label="Vista de tablero">
          <LayoutGrid className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>
      <Button variant="outline" size="sm" onClick={onExport} aria-label="Exportar CSV">
        <DownloadIcon className="h-4 w-4 sm:mr-1" />
        <span className="hidden sm:inline">Exportar CSV</span>
      </Button>
      <RoleGuard module="Mantenimiento" minAccess="full">
        <Button
          variant="outline"
          size="sm"
          onClick={onGenerateRecurring}
          disabled={isGenerating}
          aria-label="Generar recurrente"
        >
          <RefreshIcon className={`h-4 w-4 sm:mr-1 ${isGenerating ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Generar Recurrente</span>
        </Button>
      </RoleGuard>
      <Button onClick={onCreate} size="sm">
        <AddIcon className="h-4 w-4 mr-1" /> Registrar Servicio
      </Button>
    </div>
  );
}

