/**
 * Query key factories para la feature `inventory`.
 */
import { createEntityKeys } from "@/lib/query/createEntityKeys";

export const partInventoryKeys = createEntityKeys("parts_inventory");

/** Partes consumidas por orden de mantenimiento. Lote C · DIFF 9c. */
export const maintenancePartKeys = {
  ...createEntityKeys("maintenance_parts"),
  byLog: (maintenanceLogId: string) =>
    ["maintenance_parts", "by-log", maintenanceLogId] as const,
} as const;
