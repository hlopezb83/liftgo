import { parseISO } from "date-fns";
import { z } from "zod";
import { toYMD } from "@/lib/format/dateFormats";
import type { MaintenanceLog } from "../hooks/maintenance/useMaintenanceLogs";

export const maintenanceFormSchema = z.object({
  forkliftId: z.string().min(1, "Montacargas requerido"),
  serviceType: z.string().min(1, "Tipo de servicio requerido"),
  description: z.string(),
  cost: z.string(),
  performedBy: z.string(),
  performedAt: z.date(),
  nextServiceDate: z.date().optional(),
  supplierId: z.string(),
});

export type MaintenanceFormValues = z.infer<typeof maintenanceFormSchema>;

export const initialMaintenanceForm: MaintenanceFormValues = {
  forkliftId: "", serviceType: "", description: "", cost: "",
  performedBy: "", performedAt: new Date(), nextServiceDate: undefined, supplierId: "",
};

export function maintenanceLogToFormValues(log: MaintenanceLog): MaintenanceFormValues {
  return {
    forkliftId: log.forklift_id,
    serviceType: log.service_type,
    description: log.description || "",
    cost: log.cost?.toString() || "",
    performedBy: log.performed_by || "",
    performedAt: log.performed_at ? parseISO(log.performed_at) : new Date(),
    nextServiceDate: log.next_service_date ? parseISO(log.next_service_date) : undefined,
    supplierId: log.supplier_id || "",
  };
}

export function buildMaintenancePayload(values: MaintenanceFormValues) {
  return {
    forklift_id: values.forkliftId,
    service_type: values.serviceType,
    description: values.description || null,
    cost: values.cost ? parseFloat(values.cost) : 0,
    performed_by: values.performedBy || null,
    performed_at: toYMD(values.performedAt),
    next_service_date: values.nextServiceDate ? toYMD(values.nextServiceDate) : null,
    supplier_id: values.supplierId || null,
  };
}
