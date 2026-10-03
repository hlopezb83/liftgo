import { z } from "zod";

export const platformCapabilitySchema = z.enum([
  "organizations.read", "organizations.details", "organizations.create",
  "organizations.suspend", "organizations.resume", "catalogs.read",
  "catalogs.write", "catalogs.import", "templates.read", "templates.publish",
  "templates.assign", "templates.import", "audit.read", "operators.read", "operators.manage",
  "integrations.read", "integrations.check", "integrations.retry", "monitoring.read", "support.read", "support.manage",
]);
export type PlatformCapability = z.infer<typeof platformCapabilitySchema>;
export const platformAccessSchema = z.object({
  isOperator: z.boolean(),
  profile: z.enum(["root", "organizations", "catalogs", "support", "observer"]).nullable(),
  revision: z.string().regex(/^[1-9]\d*$/).nullable(),
  capabilities: z.array(platformCapabilitySchema),
}).refine((value) => value.isOperator
  ? value.profile !== null && value.revision !== null
  : value.profile === null && value.revision === null && value.capabilities.length === 0);
export type PlatformAccess = z.infer<typeof platformAccessSchema>;

export const PLATFORM_PROFILE_LABELS = {
  root: "Operador raíz", organizations: "Gestión de empresas",
  catalogs: "Catálogos y documentos", support: "Soporte", observer: "Observador",
} as const;
