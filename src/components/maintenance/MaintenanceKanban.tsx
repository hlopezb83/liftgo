import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { useUpdateMaintenanceLog, type MaintenanceLog } from "@/hooks/useMaintenanceLogs";
import { MAINTENANCE_WORK_STATUSES, MAINTENANCE_WORK_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Wrench, Clock, Package, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const COLUMN_CONFIG: Record<string, { icon: typeof Wrench; color: string; bg: string; border: string }> = {
  pending: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800" },
  in_progress: { icon: Wrench, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-800" },
  waiting_parts: { icon: Package, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30", border: "border-orange-200 dark:border-orange-800" },
  completed: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-800" },
};

interface Props {
  logs: (MaintenanceLog & { forklift_name: string })[];
}

export function MaintenanceKanban({ logs }: Props) {
  const updateLog = useUpdateMaintenanceLog();
  const qc = useQueryClient();

  const columns = MAINTENANCE_WORK_STATUSES.map((status) => ({
    id: status,
    label: MAINTENANCE_WORK_STATUS_LABELS[status],
    items: logs.filter((l) => (l.work_status || "pending") === status),
    ...COLUMN_CONFIG[status],
  }));

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || result.source.droppableId === result.destination.droppableId) return;
    const logId = result.draggableId;
    const newStatus = result.destination.droppableId;

    // Optimistic update
    qc.setQueryData<MaintenanceLog[]>(["maintenance_logs", undefined], (old) =>
      old?.map((l) => (l.id === logId ? { ...l, work_status: newStatus } : l))
    );

    updateLog.mutate(
      { id: logId, work_status: newStatus } as any,
      {
        onError: () => {
          qc.invalidateQueries({ queryKey: ["maintenance_logs"] });
          toast.error("Error al actualizar estado");
        },
      }
    );
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map((col) => {
          const Icon = col.icon;
          return (
            <div key={col.id} className={cn("rounded-lg border p-3 min-h-[200px]", col.bg, col.border)}>
              <div className="flex items-center gap-2 mb-3">
                <Icon className={cn("h-4 w-4", col.color)} />
                <h3 className="text-sm font-semibold">{col.label}</h3>
                <span className="ml-auto text-xs text-muted-foreground font-mono">{col.items.length}</span>
              </div>
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn("space-y-2 min-h-[100px] rounded-md transition-colors p-1", snapshot.isDraggingOver && "bg-accent/50")}
                  >
                    {col.items.map((log, index) => (
                      <Draggable key={log.id} draggableId={log.id} index={index}>
                        {(provided, snapshot) => (
                          <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
                            <Card className={cn("cursor-grab active:cursor-grabbing transition-shadow", snapshot.isDragging && "shadow-lg ring-2 ring-primary/20")}>
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
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
