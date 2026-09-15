/**
 * Query key factory para la feature `contracts`.
 */
import { createEntityKeys } from "@/lib/query/createEntityKeys";

export const contractKeys = createEntityKeys("contracts");

export const contractTemplateKeys = {
  all: ["contract_templates"] as const,
  /**
   * Subtramo 6.1: la plantilla predeterminada se resuelve por organización
   * verificada; la clave incluye esa organización para no reutilizar la caché
   * entre empresas.
   */
  default: (organizationId?: string) =>
    [...contractTemplateKeys.all, "default", organizationId ?? "unresolved"] as const,
} as const;
