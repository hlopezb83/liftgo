import { parseISO } from "date-fns";
import { z } from "zod";
import { toYMD } from "@/lib/format/dateFormats";
import type { MaintenanceLog } from "../hooks/maintenance/useMaintenanceLogs";

export const maintenanceFormSchema = z.object({
  forkliftId: z.string().min(1, "Montacargas requerido"),
  serviceType: z.string().min(1, "Tipo de servicio requerido"),
  description: z.string(),
  // R10 Bloque 2: CurrencyField emite `number | null`. Antes era `z.string()`
  // y el submit fallaba con "expected string, received number".
  cost: z.number().nonnegative("El costo no puede ser negativo").nullable(),
  performedBy: z.string(),
  performedAt: z.date(),
  nextServiceDate: z.date().optional(),
  supplierId: z.string(),
});

export type MaintenanceFormValues = z.infer<typeof maintenanceFormSchema>;

export const initialMaintenanceForm: MaintenanceFormValues = {
  forkliftId: "", serviceType: "", description: "", cost: null,
  performedBy: "", performedAt: new Date(), nextServiceDate: undefined, supplierId: "",
};

export function maintenanceLogToFormValues(log: MaintenanceLog): MaintenanceFormValues {
  // R10 Bloque 5: prellenamos desde `manual_cost` (columna capturada por
  // usuario) — `cost` es recalculada por trigger sumando refacciones/MO y
  // sobreescribiría el valor manual al editar.
  const manual = (log as { manual_cost?: number | null }).manual_cost;
  return {
    forkliftId: log.forklift_id,
    serviceType: log.service_type,
    description: log.description || "",
    cost: manual ?? null,
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
    // R10 Bloque 5: escribimos en `manual_cost`; el trigger
    // `recalc_maintenance_log_cost` recalcula `cost = manual_cost + partes + labor`.
    manual_cost: values.cost ?? 0,
    performed_by: values.performedBy || null,
    performed_at: toYMD(values.performedAt),
    next_service_date: values.nextServiceDate ? toYMD(values.nextServiceDate) : null,
    supplier_id: values.supplierId || null,
  };
}

