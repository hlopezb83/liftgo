import { useMemo } from "react";
import { useMaintenanceLogs } from "@/features/maintenance";
import { MAINTENANCE_WORK_STATUSES } from "@/lib/constants";
import type { MaintenanceWindow } from "../components/calendar/GanttCard";

const OPEN_MAINTENANCE_STATUSES = new Set<string>(
  MAINTENANCE_WORK_STATUSES.filter((status) => status !== "completed"),
);

/** Franjas de mantenimiento (próximo servicio y OT abiertas) por equipo. */
export function useMaintenanceWindows(): MaintenanceWindow[] {
  const { data: maintenanceLogs } = useMaintenanceLogs();
  return useMemo(
    () =>
      (maintenanceLogs ?? []).flatMap((log) => {
        const windows: MaintenanceWindow[] = [];
        if (log.next_service_date) {
          windows.push({
            id: `${log.id}-next`,
            forklift_id: log.forklift_id,
            date: log.next_service_date,
            label: `Próximo servicio: ${log.service_type ?? "mantenimiento"}`,
          });
        }
        // Las pólizas recurrentes crean registros "scheduled" con performed_at
        // como fecha prevista. No son OTs activas ni deben activar el buffer
        // del Gantt; sólo los estados operativos representan trabajo abierto.
        if (OPEN_MAINTENANCE_STATUSES.has(log.work_status) && log.performed_at) {
          windows.push({
            id: `${log.id}-open`,
            forklift_id: log.forklift_id,
            date: log.performed_at.slice(0, 10),
            label: `OT abierta: ${log.service_type ?? "mantenimiento"}`,
          });
        }
        return windows;
      }),
    [maintenanceLogs],
  );
}
