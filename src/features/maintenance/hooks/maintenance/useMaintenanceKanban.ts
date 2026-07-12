import { useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import {
  useUpdateMaintenanceLog,
  type MaintenanceLog,
} from "./useMaintenanceLogs";
import type { DropResult } from "@hello-pangea/dnd";

/**
 * Encapsula el optimistic update del kanban de mantenimiento al arrastrar
 * tarjetas entre columnas. La vista solo conoce el handler y queda libre de
 * acoplamiento con TanStack Query.
 */
export function useMaintenanceKanban() {
  const updateLog = useUpdateMaintenanceLog();
  const queryClient = useQueryClient();

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || result.source.droppableId === result.destination.droppableId) return;
    const logId = result.draggableId;
    const newStatus = result.destination.droppableId;

    queryClient.setQueryData<MaintenanceLog[]>(["maintenance_logs", undefined], (old) =>
      old?.map((l) => (l.id === logId ? { ...l, work_status: newStatus } : l)),
    );

    updateLog.mutate(
      { id: logId, work_status: newStatus },
      {
        onError: (err) => {
          queryClient.invalidateQueries({ queryKey: ["maintenance_logs"] });
          notifyError({ error: err, message: "Error al actualizar estado" });
        },
      },
    );
  };

  return { onDragEnd };
}
