import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import type { Tables } from "@/integrations/supabase/types";

export type AssignedForklift = Tables<"quote_assigned_forklifts">;

export function useQuoteAssignments(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["quote_assigned_forklifts", quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_assigned_forklifts")
        .select("*")
        .eq("quote_id", quoteId!)
        .order("line_index");
      if (error) throw error;
      return data;
    },
  });
}

export function useAssignForklift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assignments: { quoteId: string; forkliftId: string; lineIndex: number }[]) => {
      // Insert assignments
      const rows = assignments.map((a) => ({
        quote_id: a.quoteId,
        forklift_id: a.forkliftId,
        line_index: a.lineIndex,
      }));
      const { error: insertError } = await supabase
        .from("quote_assigned_forklifts")
        .insert(rows);
      if (insertError) throw insertError;

      // Update each forklift to 'sold' and log status change
      for (const a of assignments) {
        const { data: fl } = await supabase
          .from("forklifts")
          .select("status")
          .eq("id", a.forkliftId)
          .single();

        await supabase
          .from("forklifts")
          .update({ status: "sold" })
          .eq("id", a.forkliftId);

        await supabase.from("status_logs").insert({
          forklift_id: a.forkliftId,
          from_status: fl?.status || "available",
          to_status: "sold",
          note: "Asignado a cotización de venta",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote_assigned_forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
      toast.success("Equipos asignados correctamente");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUnassignForklift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ assignmentId, forkliftId }: { assignmentId: string; forkliftId: string }) => {
      const { error } = await supabase
        .from("quote_assigned_forklifts")
        .delete()
        .eq("id", assignmentId);
      if (error) throw error;

      await supabase
        .from("forklifts")
        .update({ status: "available" })
        .eq("id", forkliftId);

      await supabase.from("status_logs").insert({
        forklift_id: forkliftId,
        from_status: "sold",
        to_status: "available",
        note: "Desasignado de cotización de venta",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote_assigned_forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
      toast.success("Equipo desasignado");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
