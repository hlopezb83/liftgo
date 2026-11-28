import { z } from "zod";

const supportStatusSchema = z.enum(["new", "in_progress", "waiting", "resolved", "closed"]);
const supportSeveritySchema = z.enum(["critical", "high", "medium", "low"]);
const revision = z.string().regex(/^[1-9]\d*$/).max(18);
export const supportCaseSchema = z.object({
  id: z.uuid(), organizationId: z.uuid(), organizationName: z.string(), folio: z.string(), revision,
  status: supportStatusSchema, severity: supportSeveritySchema, assigneeId: z.uuid().nullable(), assigneeName: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(), shared: z.boolean(), sharedUntil: z.string(),
  title: z.string().nullable(), description: z.string().nullable().optional(), module: z.string().nullable(),
  appVersion: z.string().nullable(), requestId: z.uuid().nullable(), hasScreenshot: z.boolean(),
});
export type SupportCase = z.infer<typeof supportCaseSchema>;
export const supportListInputSchema = z.object({ search: z.string().trim().max(100).default(""),
  organizationId: z.uuid().nullable().default(null), status: supportStatusSchema.or(z.literal("open")).nullable().default(null),
  severity: supportSeveritySchema.nullable().default(null), offset: z.number().int().min(0).max(100000).default(0) });
export type SupportListInput = z.input<typeof supportListInputSchema>;
export const supportListSchema = z.object({ rows: z.array(supportCaseSchema), total: z.number().int().nonnegative(), observedAt: z.string() });
export const supportDetailInputSchema = z.object({ caseId: z.uuid(), before: revision.nullable().default(null) });
export type SupportDetailInput = z.input<typeof supportDetailInputSchema>;
export const supportDetailSchema = z.object({ case: supportCaseSchema,
  events: z.array(z.object({ id: revision, actorName: z.string().nullable(), action: z.enum(["shared", "withdrawn", "expired", "updated"]),
    status: supportStatusSchema, severity: supportSeveritySchema, assigneeId: z.uuid().nullable(), assigneeName: z.string().nullable(), comment: z.string().nullable(), createdAt: z.string() })),
  nextCursor: revision.nullable(), assignees: z.array(z.object({ id: z.uuid(), name: z.string().nullable() })),
});
export type SupportDetail = z.infer<typeof supportDetailSchema>;
export const supportUpdateSchema = z.object({ caseId: z.uuid(), revision, status: supportStatusSchema,
  severity: supportSeveritySchema, assigneeId: z.uuid().nullable(), comment: z.string().trim().max(2000).default("") });
export type SupportUpdate = z.input<typeof supportUpdateSchema>;
export const SUPPORT_STATUSES = { new: "Nuevo", in_progress: "En atención", waiting: "En espera", resolved: "Resuelto", closed: "Cerrado" } as const;
export const SUPPORT_SEVERITIES = { critical: "Crítica", high: "Alta", medium: "Media", low: "Baja" } as const;
