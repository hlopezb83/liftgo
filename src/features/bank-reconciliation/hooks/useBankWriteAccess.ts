import { useHasModuleAccess, useUserRole } from "@/features/users";

/** Mirrors the existing role and module guards on the bank mutation RPCs. */
export function useBankWriteAccess() {
  const fullAccess = useHasModuleAccess("Conciliación Bancaria", "full");
  const { data: role } = useUserRole();
  return fullAccess && (role === "admin" || role === "administrativo");
}
