import { useState } from "react";
import { DragDropContext } from "@hello-pangea/dnd";
import { type MaintenanceLog } from "../../hooks/maintenance/useMaintenanceLogs";
import { useMaintenanceKanban } from "../../hooks/maintenance/useMaintenanceKanban";
import { MAINTENANCE_WORK_STATUSES, MAINTENANCE_WORK_STATUS_LABELS } from "@/lib/constants";
import { Wrench, Clock, Package, CheckCircle2 } from "lucide-react";
import { MaintenanceKanbanColumn } from "./kanban/MaintenanceKanbanColumn";
import { MaintenanceDetailSheet } from "./kanban/MaintenanceDetailSheet";

const COLUMN_CONFIG: Record<string, { icon: typeof Wrench; color: string; bg: string; border: string }> = {
  pending: { icon: Clock, color: "text-warning", bg: "bg-warning/10", border: "border-warning/30" },
  in_progress: { icon: Wrench, color: "text-info", bg: "bg-info/10", border: "border-info/30" },
  waiting_parts: { icon: Package, color: "text-warning", bg: "bg-warning/10", border: "border-warning/30" },
  completed: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10", border: "border-success/30" },
};

interface Props {
  logs: (MaintenanceLog & { forklift_name: string })[];
}

export function MaintenanceKanban({ logs }: Props) {
  const [selectedLog, setSelectedLog] = useState<(MaintenanceLog & { forklift_name: string }) | null>(null);
  const { onDragEnd } = useMaintenanceKanban();

  const columns = MAINTENANCE_WORK_STATUSES.map((status) => ({
    id: status,
    label: MAINTENANCE_WORK_STATUS_LABELS[status],
    items: logs.filter((l) => (l.work_status || "pending") === status),
    ...COLUMN_CONFIG[status],
  }));

  const currentLog = selectedLog
    ? logs.find((l) => l.id === selectedLog.id) || selectedLog
    : null;

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {columns.map((col) => (
            <MaintenanceKanbanColumn
              key={col.id}
              id={col.id}
              label={col.label}
              icon={col.icon}
              color={col.color}
              bg={col.bg}
              border={col.border}
              items={col.items}
              onSelectLog={setSelectedLog}
            />
          ))}
        </div>
      </DragDropContext>

      <MaintenanceDetailSheet log={currentLog} onClose={() => setSelectedLog(null)} />
    </>
  );
}
