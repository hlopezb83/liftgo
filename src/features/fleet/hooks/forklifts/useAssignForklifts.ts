import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import type { Tables } from "@/integrations/supabase/types";

type AssignedForklift = Tables<"quote_assigned_forklifts">;

export function useQuoteAssignments(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["quote_assigned_forklifts", quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_assigned_forklifts")
        .select("*")
        .eq("quote_id", quoteId ?? "")
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

      // Bulk read current statuses (1 round trip), bulk update to 'sold' (1), bulk insert logs (1)
      const ids = assignments.map((a) => a.forkliftId);
      const { data: currentForklifts } = await supabase
        .from("forklifts")
        .select("id,status")
        .in("id", ids);
      const statusById = new Map((currentForklifts ?? []).map((f) => [f.id, f.status]));

      const { error: updateError } = await supabase
        .from("forklifts")
        .update({ status: "sold" })
        .in("id", ids);
      if (updateError) throw updateError;

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
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["quote_assigned_forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
    },
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
      toast.success("Equipo desasignado");
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["quote_assigned_forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
    },
  });
}
