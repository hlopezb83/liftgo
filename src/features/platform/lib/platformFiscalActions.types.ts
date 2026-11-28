import { z } from "zod";

export const fiscalActionStatusSchema = z.enum(["pending", "recovered", "pac_pending", "missing", "retry_scheduled",
  "cancelled", "cancellation_pending", "provider_failed", "inconclusive", "config_changed", "document_changed", "expired", "budget_exhausted"]);
export const fiscalActionInputSchema = z.object({ jobId: z.uuid(), requestId: z.uuid(),
  revision: z.string().regex(/^[1-9]\d{0,18}$/).refine((value) => BigInt(value) <= 9223372036854775807n),
  intent: z.enum(["reconcile", "retry"]), reason: z.string().trim().min(10).max(300) });
export type FiscalActionInput = z.infer<typeof fiscalActionInputSchema>;
export const fiscalActionsSchema = z.array(z.object({ id: z.uuid(), actorId: z.uuid(), actorName: z.string(), intent: z.enum(["reconcile", "retry"]),
  reason: z.string(), status: fiscalActionStatusSchema, expectedRevision: z.string(), startedAt: z.string(),
  completedAt: z.string().nullable(), expiresAt: z.string() }));
export type FiscalAction = z.infer<typeof fiscalActionsSchema>[number];
export const FISCAL_ACTION_STATUS = {
  pending: "Consulta en proceso", recovered: "CFDI localizado en Facturapi; revisa el estado del documento",
  pac_pending: "Facturapi sigue procesando; no volver a timbrar", missing: "No encontrado en esta consulta",
  retry_scheduled: "Reprogramado en la cola del ERP", cancelled: "Cancelación confirmada por Facturapi",
  cancellation_pending: "Cancelación en trámite; no se reenvió", provider_failed: "Facturapi confirmó un fallo; revisión manual",
  inconclusive: "Resultado incierto; no se reprogramó", config_changed: "La configuración cambió; no se aplicó el resultado",
  document_changed: "El documento o trabajo cambió; no se aplicó el resultado", expired: "La reserva venció; actualiza antes de continuar",
  budget_exhausted: "Se alcanzó el límite de reprogramaciones; revisión manual",
} as const;
