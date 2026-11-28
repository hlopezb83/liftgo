import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { canModifyMaintenance } from "../../lib/maintenanceAccess";
import { MaintenanceKanbanCard } from "./MaintenanceKanbanCard";
import type { MaintenanceLog } from "../../hooks/useMaintenanceLogs";
import type { ComponentType } from "react";

interface Props {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  items: (MaintenanceLog & { forklift_name: string })[];
  canWrite: boolean;
  onSelectLog: (log: MaintenanceLog & { forklift_name: string }, trigger: HTMLButtonElement) => void;
}

export function MaintenanceKanbanColumn({ id, label, icon: Icon, color, bg, border, items, canWrite, onSelectLog }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "column", status: id },
    disabled: !canWrite,
  });

  const itemIds = items.map((l) => l.id);

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
      <div
        ref={setNodeRef}
        className={cn(
          "space-y-2 min-h-[100px] rounded-md transition-colors p-1",
          isOver && "bg-accent/50",
        )}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.map((log) => (
            <SortableMaintenanceItem
              key={log.id}
              log={log}
              status={id}
              canWrite={canWrite}
              onSelect={(trigger) => onSelectLog(log, trigger)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

function SortableMaintenanceItem({
  log,
  status,
  onSelect,
  canWrite,
}: {
  log: MaintenanceLog & { forklift_name: string };
  status: string;
  onSelect: (trigger: HTMLButtonElement) => void;
  canWrite: boolean;
}) {
  const canDrag = canModifyMaintenance(log, canWrite);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: log.id,
    data: { type: "card", status },
    disabled: { draggable: !canDrag, droppable: !canWrite },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`maintenance-kanban-card-${log.id}`}
    >
      <MaintenanceKanbanCard
        log={log}
        isDragging={isDragging}
        onSelect={onSelect}
        dragHandle={canDrag ? { ref: setActivatorNodeRef, ...attributes, ...listeners } : undefined}
      />
    </div>
  );
}
