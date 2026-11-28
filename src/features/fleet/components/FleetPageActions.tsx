import { AddIcon, DownloadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { RoleGuard } from "@/layouts/RoleGuard";

interface ExportProps {
  onExport: () => void;
  exportDisabled?: boolean;
  compact?: boolean;
}

export function FleetExportAction({ onExport, exportDisabled, compact = false }: ExportProps) {
  return (
    <Button
      variant="outline"
      size={compact ? "iconSm" : "sm"}
      disabled={exportDisabled}
      title={exportDisabled ? "Carga todas las páginas antes de exportar" : "Exportar CSV"}
      aria-label="Exportar CSV"
      onClick={onExport}
    >
      <DownloadIcon className="h-4 w-4" />
      {!compact && "Exportar CSV"}
    </Button>
  );
}

export function FleetPrimaryAction({ onCreate, compact = false }: { onCreate: () => void; compact?: boolean }) {
  return (
    <RoleGuard module="Flota" minAccess="full" fallback={null}>
      <Button onClick={onCreate} size="sm">
        <AddIcon className="h-4 w-4" />
        {compact ? "Nuevo equipo" : "Agregar montacargas"}
      </Button>
    </RoleGuard>
  );
}

export function FleetPageActions({ onCreate, ...exportProps }: ExportProps & { onCreate: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <FleetExportAction {...exportProps} />
      <FleetPrimaryAction onCreate={onCreate} />
    </div>
  );
}
