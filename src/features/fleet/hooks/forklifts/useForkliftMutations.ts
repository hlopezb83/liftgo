import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { insertCostoVentaIfSold } from "../../lib/insertCostoVentaIfSold";
import { forkliftKeys } from "../../lib/queryKeys";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { Forklift } from "@/types/rental";

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: forkliftKeys.all }),
    onError: (err: Error) => {
      notifyError({ title: "Error al crear montacargas", error: err });
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
      queryClient.setQueryData<Forklift[]>(forkliftKeys.lists(), (old) =>
        old ? old.map((f) => (f.id === data.id ? { ...f, ...data } : f)) : old
      );
      queryClient.setQueryData(forkliftKeys.detail(data.id), data);
      queryClient.invalidateQueries({ queryKey: ["forklift-options"] });
      queryClient.invalidateQueries({ queryKey: ["supplier_bills"] });
      queryClient.invalidateQueries({ queryKey: ["insurance-alerts"] });
    },
    onError: (err: Error) => {
      notifyError({ title: "Error al actualizar montacargas", error: err });
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
      await queryClient.cancelQueries({ queryKey: forkliftKeys.all });
      const previous = queryClient.getQueryData<Forklift[]>(forkliftKeys.lists());
      queryClient.setQueryData<Forklift[]>(forkliftKeys.lists(), (old) => old?.filter((f) => f.id !== id));
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(forkliftKeys.lists(), context.previous);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: forkliftKeys.all }),
  });
}

export function useUpdateStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      forkliftId, fromStatus, toStatus, note,
    }: { forkliftId: string; fromStatus: string; toStatus: string; note?: string }) => {
      const { data: updated, error: upErr } = await supabase
        .from("forklifts")
        .update({ status: toStatus })
        .eq("id", forkliftId)
        .select("id");
      if (upErr) throw upErr;
      assertRowsAffected(updated, "Actualizar estado de montacargas");
      await supabase.from("status_logs").insert({
        forklift_id: forkliftId, from_status: fromStatus, to_status: toStatus, note,
      });
      // Nota: el COGS de equipos vendidos se calcula automáticamente en el RPC
      // del Estado de Resultados a partir del valor en libros (acquisition_cost
      // menos depreciación acumulada). NO insertamos una factura `costo_venta`
      // para evitar doble conteo del COGS en el P&L (v6.92.0).
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: forkliftKeys.all });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
    },
  });
}
