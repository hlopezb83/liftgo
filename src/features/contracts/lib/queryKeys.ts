/**
 * Query key factory para la feature `contracts`.
 */
import { createEntityKeys } from "@/lib/query/createEntityKeys";

export const contractKeys = createEntityKeys("contracts");

export const contractTemplateKeys = {
  all: ["contract_templates"] as const,
  default: () => [...contractTemplateKeys.all, "default"] as const,
} as const;
