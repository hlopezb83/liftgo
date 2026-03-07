import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
export type { Forklift, StatusLog } from "@/types/rental";
import type { Forklift, StatusLog } from "@/types/rental";

// ─── Forklifts ────────────────────────────────────────

export function useForklifts() {
  return useQuery({
    queryKey: ["forklifts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("forklifts").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useForklift(id: string | undefined) {
  return useQuery({
    queryKey: ["forklifts", id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) throw new Error("Forklift ID is required");
      const { data, error } = await supabase.from("forklifts").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateForklift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (forklift: TablesInsert<"forklifts">) => {
      const { data, error } = await supabase.from("forklifts").insert(forklift).select().single();
      if (error) throw error;
      await supabase.from("status_logs").insert({
        forklift_id: data.id,
        to_status: forklift.status || "available",
        note: "Registro inicial",
      });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["forklifts"] }),
    onError: (err: Error) => {
      import("@/hooks/use-toast").then(({ toast }) =>
        toast({ title: "Error al crear montacargas", description: err.message, variant: "destructive" })
      );
    },
  });
}

export function useUpdateForklift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"forklifts"> & { id: string }) => {
      const { data, error } = await supabase.from("forklifts").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["forklifts", data.id] });
    },
    onError: (err: Error) => {
      import("@/hooks/use-toast").then(({ toast }) =>
        toast({ title: "Error al actualizar montacargas", description: err.message, variant: "destructive" })
      );
    },
  });
}

export function useDeleteForklift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_forklift", { p_forklift_id: id });
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["forklifts"] });
      const previous = queryClient.getQueryData<Forklift[]>(["forklifts"]);
      queryClient.setQueryData<Forklift[]>(["forklifts"], (old) => old?.filter((f) => f.id !== id));
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(["forklifts"], context.previous);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["forklifts"] }),
  });
}

export function useUpdateStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      forkliftId, fromStatus, toStatus, note,
    }: { forkliftId: string; fromStatus: string; toStatus: string; note?: string }) => {
      await supabase.from("forklifts").update({ status: toStatus }).eq("id", forkliftId);
      await supabase.from("status_logs").insert({
        forklift_id: forkliftId, from_status: fromStatus, to_status: toStatus, note,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
    },
  });
}

// ─── Status Logs ──────────────────────────────────────

export function useStatusLogs(forkliftId: string | undefined) {
  return useQuery({
    queryKey: ["status_logs", forkliftId],
    enabled: !!forkliftId,
    queryFn: async () => {
      if (!forkliftId) throw new Error("Forklift ID is required for status logs");
      const { data, error } = await supabase
        .from("status_logs").select("*").eq("forklift_id", forkliftId)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
