import { z } from "zod";

export const platformOrganizationDetailSchema = z.object({
  organization: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    is_active: z.boolean(),
    created_at: z.string(),
  }),
  can_suspend: z.boolean(),
  settings: z.object({
    records: z.number().int().nonnegative(),
    razon_social: z.string().nullable(),
    rfc: z.string().nullable(),
    regimen_fiscal: z.string().nullable(),
    postal_code: z.string().nullable(),
    maintenance_buffer_days: z.number().nullable(),
    updated_at: z.string().nullable(),
  }),
  billing: z.object({
    mode: z.enum(["test", "live"]).nullable(),
    key_configured: z.boolean(),
  }),
  administrators: z.array(
    z.object({
      user_id: z.uuid(),
      full_name: z.string().nullable(),
      email: z.string().nullable(),
      is_active: z.boolean(),
    }),
  ),
  catalogs: z.object({
    models_enabled: z.number().int().nonnegative(),
    global_models_enabled: z.number().int().nonnegative(),
    parts_enabled: z.number().int().nonnegative(),
    global_parts_enabled: z.number().int().nonnegative(),
  }),
  templates: z.array(
    z.object({
      definition_id: z.uuid(),
      name: z.string(),
      document_type: z.string(),
      version_id: z.uuid(),
      version: z.number().int().positive(),
      is_active: z.boolean(),
      is_current: z.boolean(),
    }),
  ),
  active_bank_accounts: z.number().int().nonnegative(),
  counters: z.array(
    z.object({
      document_type: z.string(),
      next_value: z.string().regex(/^[1-9]\d*$/),
    }),
  ),
  checked_at: z.string(),
});

export type PlatformOrganizationDetail = z.infer<
  typeof platformOrganizationDetailSchema
>;
export const platformOrganizationDetailInputSchema = z.object({
  organization_id: z.uuid(),
});
export type PlatformOrganizationDetailInput = z.infer<
  typeof platformOrganizationDetailInputSchema
>;
