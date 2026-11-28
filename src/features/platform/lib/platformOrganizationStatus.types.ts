import { z } from "zod";

const CREDENTIAL_PATTERN =
  /sk_(?:test|live|proj)[_-][A-Za-z0-9]|sb_secret_|Bearer\s+\S+|eyJ[A-Za-z0-9_-]{10,}\./i;
export const organizationStatusReasonSchema = z
  .string()
  .trim()
  .min(5)
  .max(500)
  .refine(
    (value) => !CREDENTIAL_PATTERN.test(value),
    "El motivo no debe contener llaves ni tokens",
  );
export const platformOrganizationStatusInputSchema = z.object({
  organization_id: z.uuid(),
  active: z.boolean(),
  reason: organizationStatusReasonSchema,
});
