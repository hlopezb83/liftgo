import type { AppRole } from "@/features/users";

// Debe coincidir con la autorización de validate-customers-tax-info.
export const SAT_VALIDATION_ROLES = ["admin", "administrativo"] as const satisfies readonly AppRole[];
