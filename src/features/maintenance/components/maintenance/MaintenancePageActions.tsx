import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RoleGuard } from "@/layouts/RoleGuard";
import { Plus, Download, List, LayoutGrid, RefreshCw } from "@/components/icons";

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
    <div className="flex gap-2 items-center">
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
      <Button variant="outline" size="sm" onClick={onExport}>
        <Download className="h-4 w-4 mr-1" />Exportar CSV
      </Button>
      <RoleGuard module="Mantenimiento" minAccess="full">
        <Button variant="outline" size="sm" onClick={onGenerateRecurring} disabled={isGenerating}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isGenerating ? "animate-spin" : ""}`} />
          Generar Recurrente
        </Button>
      </RoleGuard>
      <Button onClick={onCreate} size="sm">
        <Plus className="h-4 w-4 mr-1" /> Registrar Servicio
      </Button>
    </div>
  );
}
