import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { businessBlockSummary, describeBusinessBlock } from "@/lib/rules/businessBlocks";
import { notifyError, notifyValidation } from "@/lib/ui/appFeedback";

import { maintenanceLogKeys } from "../../lib/queryKeys";
import {
  useUpdateMaintenanceLog,
  type MaintenanceLog,
} from "./useMaintenanceLogs";

import type { DragEndEvent } from "@dnd-kit/core";

/**
 * Encapsula el optimistic update del kanban de mantenimiento al arrastrar
 * tarjetas entre columnas. La vista solo conoce el handler y queda libre de
 * acoplamiento con TanStack Query.
 *
 * v7.268.0 (UX): soltar en "Completado" ya no cierra la OT en silencio;
 * se expone `pendingCloseId` para que la vista pida confirmación con el
 * resumen de costos antes de aplicar el cambio.
 */
export function useMaintenanceKanban() {
  const updateLog = useUpdateMaintenanceLog();
  const queryClient = useQueryClient();
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const logId = String(active.id);
    const sourceStatus = (active.data.current?.status as string | undefined) ?? null;

    const overType = over.data.current?.type as "column" | "card" | undefined;
    const newStatus =
      overType === "column"
        ? String(over.id)
        : (over.data.current?.status as string | undefined) ?? String(over.id);

    if (!newStatus || !sourceStatus || sourceStatus === newStatus) return;

    // A6R2-5: una OT cerrada no se reabre arrastrando la tarjeta; el guard
    // `trg_guard_maintenance_reopen` ya lo rechaza en la base de datos y aquí
    // se explica en vez de dejar pasar el error crudo.
    if (sourceStatus === "completed" || sourceStatus === "cancelled") {
      const block = describeBusinessBlock("maintenance_work_order_closed");
      notifyValidation({ title: block.action, message: businessBlockSummary(block) });
      return;
    }

    if (newStatus === "completed") {
      setPendingCloseId(logId);
      return;
    }


    queryClient.setQueryData<MaintenanceLog[]>(
      maintenanceLogKeys.byFilter({ forkliftId: null }),
      (old) => old?.map((l) => (l.id === logId ? { ...l, work_status: newStatus } : l)),
    );

    updateLog.mutate(
      { id: logId, work_status: newStatus },
      {
        // BL-006: patch cache con la fila devuelta por el server para no depender
        // del refetch de background si un trigger sobreescribió work_status.
        onSuccess: (serverRow) => {
          if (!serverRow) return;
          const nextStatus = (serverRow as { work_status?: string }).work_status;
          if (!nextStatus || nextStatus === newStatus) return;
          queryClient.setQueryData<MaintenanceLog[]>(
            maintenanceLogKeys.byFilter({ forkliftId: null }),
            (old) => old?.map((l) => (l.id === logId ? { ...l, work_status: nextStatus } : l)),
          );
        },
        onError: (err) => {
          void queryClient.invalidateQueries({ queryKey: maintenanceLogKeys.all });
          notifyError({ error: err, message: "Error al actualizar estado" });
        },
      },
    );
  };

  return {
    onDragEnd,
    pendingCloseId,
    clearPendingClose: () => setPendingCloseId(null),
  };
}
