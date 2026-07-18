import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { forkliftKeys, quoteAssignedForkliftKeys, statusLogKeys } from "../../../lib/queryKeys";

export function useAssignForklift() {
  return useEntityMutation({
    mutationFn: async (assignments: { quoteId: string; forkliftId: string; lineIndex: number }[]) => {
      const rows = assignments.map((a) => ({
        quote_id: a.quoteId,
        forklift_id: a.forkliftId,
        line_index: a.lineIndex,
      }));
      const { error: insertError } = await supabase
        .from("quote_assigned_forklifts")
        .insert(rows);
      if (insertError) throw insertError;

      const ids = assignments.map((a) => a.forkliftId);
      const { data: currentForklifts } = await supabase
        .from("forklifts")
        .select("id,status")
        .in("id", ids);
      const statusById = new Map((currentForklifts ?? []).map((f) => [f.id, f.status]));

      const { data: soldRows, error: updateError } = await supabase
        .from("forklifts")
        .update({ status: "sold" })
        .in("id", ids)
        .select("id");
      if (updateError) throw updateError;
      assertRowsAffected(soldRows, "Marcar montacargas como vendidos");

      const logs = assignments.map((a) => ({
        forklift_id: a.forkliftId,
        from_status: statusById.get(a.forkliftId) || "available",
        to_status: "sold",
        note: "Asignado a cotización de venta",
      }));
      // SEC-002: .select() para que RLS silenciosa se manifieste como fila 0.
      const { data: logRows, error: logsError } = await supabase
        .from("status_logs")
        .insert(logs)
        .select("id");
      if (logsError) throw logsError;
      assertRowsAffected(logRows, "Registrar historial de estatus");
      if (logRows.length !== logs.length) {
        throw new Error(
          `Registrar historial de estatus: se esperaban ${logs.length} registros y se insertaron ${logRows.length}.`,
        );
      }
    },
    invalidateKeys: [quoteAssignedForkliftKeys.all, forkliftKeys.all, statusLogKeys.all],
    successMsg: "Equipos asignados correctamente",
    errorTitle: "Error al asignar montacargas",
  });
}
