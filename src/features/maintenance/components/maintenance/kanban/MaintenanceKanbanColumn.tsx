import { Droppable, Draggable } from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";
import type { MaintenanceLog } from "../../../hooks/maintenance/useMaintenanceLogs";
import { MaintenanceKanbanCard } from "./MaintenanceKanbanCard";

interface Props {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  items: (MaintenanceLog & { forklift_name: string })[];
  onSelectLog: (log: MaintenanceLog & { forklift_name: string }) => void;
}

export function MaintenanceKanbanColumn({ id, label, icon: Icon, color, bg, border, items, onSelectLog }: Props) {
  return (
    <div
      className={cn("rounded-lg border p-3 min-h-[200px]", bg, border)}
      data-testid={`maintenance-kanban-column-${id}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className={cn("h-4 w-4", color)} />
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="ml-auto text-xs text-muted-foreground font-mono" data-testid={`maintenance-kanban-count-${id}`}>{items.length}</span>
      </div>
      <Droppable droppableId={id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "space-y-2 min-h-[100px] rounded-md transition-colors p-1",
              snapshot.isDraggingOver && "bg-accent/50"
            )}
          >
            {items.map((log, index) => (
              <Draggable key={log.id} draggableId={log.id} index={index}>
                {(prov, snap) => (
                  <div
                    ref={prov.innerRef}
                    {...(prov.draggableProps as unknown as React.HTMLAttributes<HTMLDivElement>)}
                    {...(prov.dragHandleProps as unknown as React.HTMLAttributes<HTMLDivElement>)}
                    data-testid={`maintenance-kanban-card-${log.id}`}
                  >
                    <MaintenanceKanbanCard log={log} isDragging={snap.isDragging} onSelect={() => onSelectLog(log)} />
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
}
