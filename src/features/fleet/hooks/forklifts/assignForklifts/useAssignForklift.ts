import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { forkliftKeys, quoteAssignedForkliftKeys, statusLogKeys } from "../../../lib/queryKeys";

type Assignment = { quoteId: string; forkliftId: string; lineIndex: number };

/**
 * M14 / FIX-R2-04 (N7): una sola RPC atómica por cotización.
 * `assign_forklift_to_sale_quote` hace INSERT quote_assigned_forklifts +
 * UPDATE forklifts → 'sold' + INSERT status_logs en una transacción, con
 * guards server-side (sold / archivado / renta activa). El flujo anterior de
 * 3 llamadas cliente no era transaccional y dejaba la RPC como código muerto.
 */
export function useAssignForklift() {
  return useEntityMutation({
    mutationFn: async (assignments: Assignment[]) => {
      const byQuote = new Map<string, Assignment[]>();
      for (const a of assignments) {
        const group = byQuote.get(a.quoteId) ?? [];
        group.push(a);
        byQuote.set(a.quoteId, group);
      }
      for (const [quoteId, group] of byQuote) {
        const { error } = await supabase.rpc("assign_forklift_to_sale_quote", {
          p_quote_id: quoteId,
          p_forklift_ids: group.map((a) => a.forkliftId),
          p_line_indices: group.map((a) => a.lineIndex),
        });
        if (error) throw error;
      }
    },
    invalidateKeys: [quoteAssignedForkliftKeys.all, forkliftKeys.all, statusLogKeys.all],
    successMsg: "Equipos asignados",
    errorTitle: "Error al asignar montacargas",
  });
}
