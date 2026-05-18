import { useState } from "react";
import { DragDropContext } from "@hello-pangea/dnd";
import { type MaintenanceLog } from "@/features/maintenance/hooks/maintenance/useMaintenanceLogs";
import { useMaintenanceKanban } from "@/features/maintenance/hooks/maintenance/useMaintenanceKanban";
import { MAINTENANCE_WORK_STATUSES, MAINTENANCE_WORK_STATUS_LABELS } from "@/lib/constants";
import { Wrench, Clock, Package, CheckCircle2 } from "lucide-react";
import { MaintenanceKanbanColumn } from "./kanban/MaintenanceKanbanColumn";
import { MaintenanceDetailSheet } from "./kanban/MaintenanceDetailSheet";

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
