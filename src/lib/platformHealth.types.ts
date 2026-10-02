import { z } from "zod";

export const integrationStatusSchema = z.enum(["pending", "connected", "unconfigured", "duplicate_key",
  "auth_error", "rate_limited", "unavailable", "invalid_response", "config_changed"]);
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;
export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  pending: "Comprobación en curso", connected: "Conexión comprobada", unconfigured: "Configuración incompleta",
  duplicate_key: "Llave compartida entre empresas", auth_error: "Llave no autorizada", rate_limited: "Límite del proveedor",
  unavailable: "Proveedor no disponible", invalid_response: "Respuesta no válida", config_changed: "Configuración modificada",
};
export const integrationListInputSchema = z.object({
  search: z.string().trim().max(100).default(""), offset: z.number().int().min(0).max(100000).default(0),
});
export type IntegrationListInput = z.input<typeof integrationListInputSchema>;
export const integrationCheckInputSchema = z.object({ organizationId: z.string().uuid(), requestId: z.string().uuid() });
export type IntegrationCheckInput = z.infer<typeof integrationCheckInputSchema>;
const checkSchema = z.object({ status: integrationStatusSchema, startedAt: z.string(), completedAt: z.string().nullable(),
  latencyMs: z.number().int().nonnegative().nullable(), httpStatus: z.number().int().nullable(), version: z.string().nullable() });
export const integrationRowSchema = z.object({ id: z.string().uuid(), name: z.string(), active: z.boolean(),
  mode: z.enum(["test", "live"]).nullable(), keyConfigured: z.boolean(), lastCheck: checkSchema.nullable(),
  queuedJobs: z.number().int().nonnegative(), exhaustedJobs: z.number().int().nonnegative() });
export type IntegrationRow = z.infer<typeof integrationRowSchema>;
export const integrationListSchema = z.object({ rows: z.array(integrationRowSchema), total: z.number().int().nonnegative(), observedAt: z.string() });
export const monitoringSchema = z.object({ observedAt: z.string(), pendingOnboarding: z.number().int().nonnegative(),
  incompleteBilling: z.number().int().nonnegative(), queuedJobs: z.number().int().nonnegative(), exhaustedJobs: z.number().int().nonnegative(),
  openReports: z.number().int().nonnegative(), lastCheckAt: z.string().nullable() });
