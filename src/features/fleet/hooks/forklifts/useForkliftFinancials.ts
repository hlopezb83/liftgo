import { useQuery } from "@tanstack/react-query";
import { useUserRole, type AppRole } from "@/features/users";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";

export interface ForkliftFinancials {
  revenue: number;
  maintenance_cost: number;
  acquisition_cost: number;
  gross_margin: number;
  roi_percent: number;
  days_rented: number;
  days_since_acquired: number;
  utilization_percent: number;
  hourometer_history: Array<{
    delivery_id: string;
    delivery_number: string;
    type: string;
    date: string;
    hours_reading: number;
    booking_id: string | null;
  }>;
}

// BL-R8-06 (R8-FE-02): el RPC get_forklift_financials rechaza con 400 a cualquier
// rol fuera de esta lista (guard has_role en migración 20260723060544). El FE no
// debe ni intentarlo para esos roles — la tarjeta degrada silenciosamente.
const FINANCIAL_VIEWER_ROLES: ReadonlySet<AppRole> = new Set([
  "admin", "administrativo", "auditor", "dispatcher",
]);

export const forkliftFinancialsQueries = defineEntityQueries<"forklift-financials", never, ForkliftFinancials>(
  "forklift-financials",
  {
    list: () => () => {
      throw new Error("forklift-financials: usar detail(forkliftId)");
    },
    detail: (forkliftId: string) => () =>
      callRpc<ForkliftFinancials>("get_forklift_financials", { p_forklift_id: forkliftId }),
    staleTime: 60_000,
  },
);

export function useForkliftFinancials(forkliftId: string | undefined) {
  const { data: role } = useUserRole();
  const canViewFinancials = !!role && FINANCIAL_VIEWER_ROLES.has(role);
  return useQuery({
    ...forkliftFinancialsQueries.detail(forkliftId ?? ""),
    // Gate por rol: sin esto el mecánico disparaba el RPC en cada detalle de
    // unidad y recibía un toast de error 400 "Forbidden".
    enabled: !!forkliftId && canViewFinancials,
    // Defensa extra: si el rol cambia en caliente o el guard drifta, no tostar.
    meta: { silent: true },
  });
}
