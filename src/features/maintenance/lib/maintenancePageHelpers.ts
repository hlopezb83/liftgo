import type { MaintenanceLog } from "@/features/maintenance/hooks/maintenance/useMaintenanceLogs";
import type { Tables } from "@/integrations/supabase/types";

type ForkliftMap = Map<string, Tables<"forklifts">>;

export type EnrichedMaintenanceLog = MaintenanceLog & { forklift_name: string };

export const forkliftName = (forkliftMap: ForkliftMap, id: string) =>
  forkliftMap.get(id)?.name ?? "";

export const enrichLogs = (
  logs: MaintenanceLog[] | undefined,
  forkliftMap: ForkliftMap,
): EnrichedMaintenanceLog[] =>
  (logs ?? []).map((log) => ({ ...log, forklift_name: forkliftName(forkliftMap, log.forklift_id) }));

export const maintenanceSortAccessors = (forkliftMap: ForkliftMap) => ({
  performed_at: (l: MaintenanceLog) => l.performed_at,
  forklift_name: (l: MaintenanceLog) => forkliftName(forkliftMap, l.forklift_id),
  service_type: (l: MaintenanceLog) => l.service_type,
  performed_by: (l: MaintenanceLog) => l.performed_by ?? "",
  cost: (l: MaintenanceLog) => l.cost ?? 0,
  next_service_date: (l: MaintenanceLog) => l.next_service_date ?? "",
});

export const maintenanceCsvRows = (
  logs: MaintenanceLog[] | undefined,
  forkliftMap: ForkliftMap,
) =>
  (logs ?? []).map((l) => ({
    Fecha: l.performed_at,
    Montacargas: forkliftName(forkliftMap, l.forklift_id),
    Servicio: l.service_type,
    "Realizado Por": l.performed_by ?? "",
    Costo: l.cost ?? 0,
    "Próximo Servicio": l.next_service_date ?? "",
  }));

export const sumCost = (logs: MaintenanceLog[] | undefined) =>
  (logs ?? []).reduce((sum, l) => sum + (l.cost ?? 0), 0);
