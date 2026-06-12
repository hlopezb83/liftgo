import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { toast } from "sonner";

export function useUnassignForklift() {
  const queryClient = useQueryClient();
  return useMutation({
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

      await supabase.from("status_logs").insert({
        forklift_id: forkliftId,
        from_status: "sold",
        to_status: "available",
        note: "Desasignado de cotización de venta",
      });
    },
    onSuccess: () => {
      toast.success("Equipo desasignado");
    },
    onError: (err: Error) => notifyError({ error: err }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["quote_assigned_forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
    },
  });
}
