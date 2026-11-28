import { z } from "zod";

const fiscalOperationSchema = z.enum(["stamp", "cancel", "cancel_nc", "cancel_rep"]);
const fiscalQueueStatusSchema = z.enum(["pending", "processing", "succeeded", "exhausted"]);
const cursor = z.string().regex(/^[1-9]\d{0,18}$/).refine((value) => /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n);
const fiscalJobStateSchema = z.object({ status: fiscalQueueStatusSchema, attempts: z.number().int(),
  maxAttempts: z.number().int(), deferrals: z.number().int(), nextRetryAt: z.string(), hasError: z.boolean() });
const fiscalJobSchema = z.object({ id: z.uuid(), organizationId: z.uuid(), organizationName: z.string(),
  documentId: z.uuid(), folio: z.string().nullable(), documentStatus: z.string().nullable(), documentAvailable: z.boolean(),
  hasUuid: z.boolean(), hasProviderId: z.boolean(), operation: fiscalOperationSchema, revision: cursor,
  configurationVerified: z.boolean().default(false),
  modeAtEnqueue: z.enum(["test", "live"]).nullable(), currentMode: z.enum(["test", "live"]).nullable(),
  createdAt: z.string(), observedAt: z.string(), removed: z.boolean(), state: fiscalJobStateSchema });
export type FiscalJob = z.infer<typeof fiscalJobSchema>;
export const fiscalJobsInputSchema = z.object({ search: z.string().trim().max(100).default(""),
  organizationId: z.uuid().nullable().default(null),
  status: fiscalQueueStatusSchema.or(z.enum(["removed", "queued"])).nullable().default(null),
  operation: fiscalOperationSchema.nullable().default(null), offset: z.number().int().min(0).max(100000).default(0) });
export type FiscalJobsInput = z.input<typeof fiscalJobsInputSchema>;
export const fiscalJobsSchema = z.object({ rows: z.array(fiscalJobSchema), total: z.number().int().nonnegative(), observedAt: z.string() });
export const fiscalJobDetailInputSchema = z.object({ jobId: z.uuid(), before: cursor.nullable().default(null) });
export type FiscalJobDetailInput = z.input<typeof fiscalJobDetailInputSchema>;
export const fiscalJobDetailSchema = z.object({ job: fiscalJobSchema, nextCursor: cursor.nullable(),
  events: z.array(z.object({ id: cursor, revision: cursor, kind: z.enum(["snapshot", "queued", "changed", "removed"]),
    observedAt: z.string(), changedFields: z.array(z.enum(["status", "attempts", "maxAttempts", "deferrals", "nextRetryAt", "hasError"])), state: fiscalJobStateSchema })) });
export type FiscalJobDetail = z.infer<typeof fiscalJobDetailSchema>;
export const FISCAL_OPERATIONS = { stamp: "Timbrar factura", cancel: "Cancelar factura", cancel_nc: "Cancelar nota de crédito", cancel_rep: "Cancelar complemento de pago" } as const;
export const FISCAL_QUEUE_STATUSES = { queued: "En cola: espera o proceso", pending: "En espera", processing: "En proceso", succeeded: "Finalizado en cola", exhausted: "Requiere revisión", removed: "Retirado de cola" } as const;
