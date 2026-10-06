import { z } from "zod";

const organizationClassificationSchema = z.enum(["unclassified", "live", "test"]);
export type OrganizationClassification = z.infer<typeof organizationClassificationSchema>;
export const ORGANIZATION_CLASSIFICATION_LABELS = {
  unclassified: "Sin clasificar", live: "Real", test: "Prueba",
} as const;
const revision = z.string().regex(/^(0|[1-9]\d{0,18})$/).refine((v) => /^(0|[1-9]\d{0,18})$/.test(v) && BigInt(v) <= 9223372036854775807n);
const text = (max: number) => z.string().trim().max(max);
const email = text(254).refine((v) => !v || z.email().safeParse(v).success, "Indica un correo válido");
const organizationGovernanceFieldsSchema = z.object({
  classification: organizationClassificationSchema,
  city: text(100), territory: text(120),
  contactName: text(120), contactEmail: email,
  contactPhone: text(40).refine((v) => !v || /^[+()0-9. -]{3,40}$/.test(v), "Indica un teléfono válido"),
});
export type OrganizationGovernanceFields = z.infer<typeof organizationGovernanceFieldsSchema>;
export const organizationGovernanceInputSchema = organizationGovernanceFieldsSchema.extend({
  organizationId: z.uuid(), revision,
  reason: text(500).min(5, "Explica el motivo con al menos cinco caracteres"),
}).refine((v) => !/sk_(test|live|user)_|sb_secret_|Bearer\s+\S+|-----BEGIN .*PRIVATE KEY/i.test(v.reason),
  { message: "Retira las credenciales del motivo", path: ["reason"] });
export type OrganizationGovernanceInput = z.infer<typeof organizationGovernanceInputSchema>;
export const organizationGovernanceTargetSchema = z.object({ organizationId: z.uuid() });
export const organizationGovernanceSummarySchema = z.object({
  organizationId: z.uuid(), classification: organizationClassificationSchema,
  city: z.string().nullable(), territory: z.string().nullable(),
  revision, updatedAt: z.string().nullable(),
});
export const organizationGovernanceSchema = organizationGovernanceSummarySchema.extend({
  contactName: z.string().nullable(), contactEmail: z.string().nullable(), contactPhone: z.string().nullable(),
});
export type OrganizationGovernance = z.infer<typeof organizationGovernanceSchema>;
export type OrganizationGovernanceSummary = z.infer<typeof organizationGovernanceSummarySchema>;
export const organizationGovernanceResultSchema = z.object({ changed: z.boolean(), governance: organizationGovernanceSchema });
