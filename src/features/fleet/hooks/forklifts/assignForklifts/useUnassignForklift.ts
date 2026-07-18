import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { forkliftKeys, quoteAssignedForkliftKeys, statusLogKeys } from "../../../lib/queryKeys";

export function useUnassignForklift() {
  return useEntityMutation({
    mutationFn: async ({ assignmentId, forkliftId }: { assignmentId: string; forkliftId: string }) => {
      const { error } = await supabase
        .from("quote_assigned_forklifts")
        .delete()
        .eq("id", assignmentId);
      if (error) throw error;

      const { data: availRows, error: availErr } = await supabase
        .from("forklifts")
        .update({ status: "available" })
        .eq("id", forkliftId)
        .select("id");
      if (availErr) throw availErr;
      assertRowsAffected(availRows, "Liberar montacargas");

      // SEC-002: .select() + assertRowsAffected para no perder logs por RLS.
      const { data: logRows, error: logErr } = await supabase
        .from("status_logs")
        .insert({
          forklift_id: forkliftId,
          from_status: "sold",
          to_status: "available",
          note: "Desasignado de cotización de venta",
        })
        .select("id");
      if (logErr) throw logErr;
      assertRowsAffected(logRows, "Registrar historial de estatus");
    },
    invalidateKeys: [quoteAssignedForkliftKeys.all, forkliftKeys.all, statusLogKeys.all],
    successMsg: "Equipo desasignado",
    errorTitle: "Error al desasignar montacargas",
  });
}
