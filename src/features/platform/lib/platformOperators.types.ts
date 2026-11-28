import { z } from "zod";

export const platformProfileSchema = z.enum(["root", "organizations", "catalogs", "support", "observer"]);
export const platformSessionSchema = z.object({
  id: z.string().uuid(),
  startedAt: z.string(),
  expiresAt: z.string().nullable(),
});
export type PlatformSession = z.infer<typeof platformSessionSchema>;
export const platformOperatorsInputSchema = z.object({
  search: z.string().trim().max(100).default(""),
  scope: z.enum(["operators", "eligible"]).default("operators"),
  offset: z.number().int().min(0).max(100_000).default(0),
});
export type PlatformOperatorsInput = z.input<typeof platformOperatorsInputSchema>;
const platformOperatorRowSchema = z.object({
  id: z.string().uuid(), name: z.string(), email: z.string(),
  profile: platformProfileSchema.nullable(),
  revision: z.string().regex(/^[1-9]\d*$/).nullable(),
  eligible: z.boolean(),
});
export type PlatformOperatorRow = z.infer<typeof platformOperatorRowSchema>;
export const platformOperatorsResultSchema = z.object({
  rows: z.array(platformOperatorRowSchema), hasMore: z.boolean(),
});
export const platformOperatorChangeSchema = z.object({
  userId: z.string().uuid(),
  profile: platformProfileSchema.nullable(),
  expectedRevision: z.string().regex(/^[1-9]\d*$/).nullable(),
  reason: z.string().trim().min(5).max(500),
  password: z.string().min(1).max(1024),
});
export type PlatformOperatorChange = z.infer<typeof platformOperatorChangeSchema>;
export const PLATFORM_PROFILE_SUMMARIES = {
  root: "Administra empresas, catálogos, documentos, bitácora y accesos de operadores.",
  organizations: "Consulta empresas y sus fichas; crea, suspende y reactiva empresas.",
  catalogs: "Administra e importa catálogos, machotes legales y sus asignaciones.",
  support: "Consulta el listado de empresas y los catálogos de equipos y refacciones.",
  observer: "Consulta empresas, catálogos, machotes legales y la bitácora global.",
} as const;
