import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatDateDisplay, cn } from "@/lib/utils";
import type { MaintenanceLog } from "@/hooks/useMaintenanceLogs";

interface Props {
  log: MaintenanceLog & { forklift_name: string };
  isDragging?: boolean;
  onSelect: () => void;
}

export function MaintenanceKanbanCard({ log, isDragging, onSelect }: Props) {
  return (
    <Card
      className={cn(
        "cursor-grab active:cursor-grabbing transition-shadow hover:ring-2 hover:ring-primary/20",
        isDragging && "shadow-lg ring-2 ring-primary/20"
      )}
      onClick={onSelect}
    >
      <CardContent className="p-3 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold truncate">{log.service_type}</span>
          <span className="text-xs font-mono font-medium">{formatCurrency(log.cost || 0)}</span>
        </div>
        <p className="text-sm text-muted-foreground truncate">{log.forklift_name || "—"}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{formatDateDisplay(log.performed_at)}</span>
          {log.performed_by && <span className="truncate">• {log.performed_by}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
