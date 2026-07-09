/**
 * Query key factories para la feature `maintenance`.
 */
import { createEntityKeys } from "@/lib/query/createEntityKeys";

export const mechanicKeys = createEntityKeys("mechanics");
export const maintenancePolicyKeys = createEntityKeys("maintenance_policies");
export const maintenanceLogKeys = createEntityKeys("maintenance_logs");
