import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
export type { Forklift, StatusLog } from "@/types/rental";
import type { Forklift } from "@/types/rental";

// ─── Forklifts ────────────────────────────────────────

export function useForklifts() {
  return useQuery({
    queryKey: ["forklifts"],
    staleTime: 60_000,
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
      toast.error("Error al crear montacargas", { description: err.message });
    },
  });
}

export function useUpdateForklift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"forklifts"> & { id: string }) => {
      const { data, error } = await supabase.from("forklifts").update(updates).eq("id", id).select().single();
      if (error) throw error;

      // Sync costo_venta expense when acquisition_cost changes on a sold forklift
      if (updates.acquisition_cost !== undefined && data.status === "sold") {
        const { data: expenses } = await supabase
          .from("operating_expenses")
          .select("id")
          .eq("category", "costo_venta" as any)
          .ilike("description", `%${data.name}%`);

        if (expenses && expenses.length > 0) {
          await supabase
            .from("operating_expenses")
            .update({ amount: Number(updates.acquisition_cost) })
            .eq("id", expenses[0].id);
        }
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["forklifts", data.id] });
      queryClient.invalidateQueries({ queryKey: ["operating_expenses"] });
    },
    onError: (err: Error) => {
      toast.error("Error al actualizar montacargas", { description: err.message });
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

      // Auto-create costo_venta expense when sold
      if (toStatus === "sold") {
        const { data: fl } = await supabase.from("forklifts").select("name, acquisition_cost").eq("id", forkliftId).single();
        const cost = Number((fl as any)?.acquisition_cost ?? 0);
        if (cost > 0) {
          const { error: expError } = await supabase.from("operating_expenses").insert({
            category: "costo_venta" as any,
            description: `Costo de venta: ${fl?.name ?? "Montacargas"}`,
            amount: cost,
            expense_date: new Date().toISOString().slice(0, 10),
            is_recurring: false,
          });
          if (expError) {
            toast.warning("No se pudo registrar el costo de venta automáticamente", { description: expError.message });
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
      queryClient.invalidateQueries({ queryKey: ["operating_expenses"] });
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
