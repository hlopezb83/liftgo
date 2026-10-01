import { useUserRole } from "@/features/users";

/** These banking snapshots retain the existing Admin/Administrative role scope. */
export function useCanManagePaymentBatches(hasFullAccess: boolean): boolean {
  const { data: role } = useUserRole();
  return hasFullAccess && (role === "admin" || role === "administrativo");
}

