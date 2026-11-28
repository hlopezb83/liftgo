import { GripVertical } from "@/components/icons";
import { Card, CardContent } from "@/components/ui/card";
import { serviceTypeLabel } from "@/lib/constants";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { cn } from "@/lib/utils";
import type { MaintenanceLog } from "../../hooks/useMaintenanceLogs";
import type { ComponentProps } from "react";

interface Props {
  log: MaintenanceLog & { forklift_name: string };
  isDragging?: boolean;
  dragHandle?: ComponentProps<"button">;
  onSelect?: (trigger: HTMLButtonElement) => void;
}

export function MaintenanceKanbanCard({ log, isDragging, dragHandle, onSelect }: Props) {
  const service = serviceTypeLabel(log.service_type);
  const date = formatDateMty(log.performed_at);
  const orderName = `${service}, ${log.forklift_name || "equipo sin nombre"}, ${date}`;
  return (
    <Card
      className={cn(
        "relative transition-shadow",
        onSelect && "hover:ring-2 hover:ring-primary/20",
        isDragging && "shadow-lg ring-2 ring-primary/20"
      )}
    >
      <CardContent className={cn("space-y-1 p-3", dragHandle && "pr-12 touch:pr-14")}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold truncate">{service}</span>
          <span className="shrink-0 text-xs font-mono font-medium">{formatCurrency(log.cost || 0)}</span>
        </div>
        <p className="text-sm text-muted-foreground truncate">{log.forklift_name || "—"}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{date}</span>
          {log.performed_by && <span className="truncate">• {log.performed_by}</span>}
        </div>
      </CardContent>
      {onSelect && (
        <button
          type="button"
          aria-label={`Abrir orden de mantenimiento: ${orderName}`}
          aria-haspopup="dialog"
          className="absolute inset-0 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(event) => onSelect(event.currentTarget)}
        />
      )}
      {dragHandle && (
        <button
          type="button"
          {...dragHandle}
          aria-label={`Mover orden de mantenimiento: ${orderName}`}
          title="Mover orden: espacio para tomar, flechas para mover y espacio para soltar"
          className="absolute right-2 top-2 z-10 inline-flex h-9 w-9 touch:h-11 touch:w-11 touch-none cursor-grab items-center justify-center rounded-sm text-muted-foreground hover:bg-accent active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <GripVertical aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </Card>
  );
}
