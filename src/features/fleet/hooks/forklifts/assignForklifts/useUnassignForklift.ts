import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { forkliftKeys, quoteAssignedForkliftKeys, statusLogKeys } from "../../../lib/queryKeys";

type UnassignForkliftRpc = (
  fn: "unassign_forklift_from_sale_quote",
  args: { p_assignment_id: string; p_forklift_id: string },
) => Promise<{ data: unknown; error: { message?: string } | null }>;

/**
 * FIX-R3-04: una sola RPC transaccional, simétrica a
 * `assign_forklift_to_sale_quote`. El flujo anterior de 3 llamadas cliente no
 * era transaccional y podía dejar la unidad 'sold' sin asignación (o al revés).
 * Cast mínimo de la firma de `supabase.rpc` hasta regenerar los tipos.
 */
export function useUnassignForklift() {
  return useEntityMutation({
    mutationFn: async ({ assignmentId, forkliftId }: { assignmentId: string; forkliftId: string }) => {
      const rpc = supabase.rpc as unknown as UnassignForkliftRpc;
      const { error } = await rpc("unassign_forklift_from_sale_quote", {
        p_assignment_id: assignmentId,
        p_forklift_id: forkliftId,
      });
      if (error) throw error;
    },
    invalidateKeys: [quoteAssignedForkliftKeys.all, forkliftKeys.all, statusLogKeys.all],
    successMsg: "Equipo desasignado",
    errorTitle: "Error al desasignar montacargas",
  });
}
