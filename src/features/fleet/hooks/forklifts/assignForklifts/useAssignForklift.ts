import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { toast } from "sonner";

export function useAssignForklift() {
  const queryClient = useQueryClient();
  return useMutation({
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
      const { error: logsError } = await supabase.from("status_logs").insert(logs);
      if (logsError) throw logsError;
    },
    onSuccess: () => {
      toast.success("Equipos asignados correctamente");
    },
    onError: (err: Error) => notifyError({ error: err }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["quote_assigned_forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
    },
  });
}
