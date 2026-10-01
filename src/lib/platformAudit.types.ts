import { z } from "zod";

export const PLATFORM_AUDIT_TARGETS = [
  "organizations",
  "equipment_model_catalog",
  "parts_catalog",
  "parts_catalog_equipment_models",
  "legal_template_definitions",
  "legal_template_versions",
  "organization_legal_template_assignments",
  "platform_operators",
] as const;
const optionalText = z.string().nullable().optional();
const safeState = z.object({
  name: optionalText,
  slug: optionalText,
  manufacturer: optionalText,
  model: optionalText,
  sku: optionalText,
  fuel_type: optionalText,
  document_type: optionalText,
  is_active: z.boolean().optional(),
  capacity_kg: z.number().nullable().optional(),
  mast_height_m: z.number().nullable().optional(),
  definition_id: optionalText,
  version_id: optionalText,
  current_version_id: optionalText,
  version: z.number().optional(),
  checksum_sha256: optionalText,
  part_catalog_id: optionalText,
  equipment_model_catalog_id: optionalText,
  auth_user_id: optionalText,
});
export const platformAuditEventSchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/),
  occurred_at: z.string(),
  actor_id: z.uuid().nullable(),
  actor_name: z.string().nullable(),
  organization_id: z.uuid().nullable(),
  target_type: z.enum(PLATFORM_AUDIT_TARGETS),
  target_id: z.uuid(),
  action: z.enum(["INSERT", "UPDATE", "DELETE"]),
  reason: z.string().nullable(),
  request_id: z.uuid(),
  changed_fields: z.array(z.string()),
  old_state: safeState.nullable(),
  new_state: safeState.nullable(),
  is_legacy: z.boolean(),
});
export const platformAuditPageSchema = z.object({
  events: z.array(platformAuditEventSchema),
  has_more: z.boolean(),
});
export type PlatformAuditEvent = z.infer<typeof platformAuditEventSchema>;
export type PlatformAuditPage = z.infer<typeof platformAuditPageSchema>;
export const platformAuditInputSchema = z.object({
  organization_id: z.uuid().optional(),
  target_type: z.enum(PLATFORM_AUDIT_TARGETS).optional(),
  before_id: z
    .string()
    .regex(/^[1-9]\d{0,18}$/)
    .refine(
      (value) =>
        /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n,
    )
    .optional(),
  limit: z.number().int().min(1).max(100).default(25),
});
export type PlatformAuditInput = z.input<typeof platformAuditInputSchema>;
