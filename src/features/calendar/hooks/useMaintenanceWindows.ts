import { useMemo } from "react";

import { useMaintenanceLogs } from "@/features/maintenance";

import type { MaintenanceWindow } from "../components/calendar/GanttCard";

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
        if (log.work_status !== "completed" && log.performed_at) {
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
