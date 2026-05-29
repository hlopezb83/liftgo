import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError, notifyWarning } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { nowMty } from "@/lib/utils";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { Forklift } from "@/types/rental";

async function insertCostoVentaIfSold(forkliftId: string, toStatus: string) {
  if (toStatus !== "sold") return;
  const { data: fl } = await supabase
    .from("forklifts").select("name, acquisition_cost").eq("id", forkliftId).single();
  const cost = Number(fl?.acquisition_cost ?? 0);
  if (cost <= 0) return;
  const { error: expError } = await supabase.from("operating_expenses").insert({
    category: "costo_venta",
    description: `Costo de venta: ${fl?.name ?? "Montacargas"}`,
    amount: cost,
    expense_date: nowMty().toISOString().slice(0, 10),
    is_recurring: false,
  });
  if (expError) {
    notifyWarning({ title: "No se pudo registrar el costo de venta automáticamente", description: expError.message });
  }
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
      queryClient.setQueryData<Forklift[]>(["forklifts"], (old) =>
        old ? old.map((f) => (f.id === data.id ? { ...f, ...data } : f)) : old
      );
      queryClient.setQueryData(["forklifts", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["forklift-options"] });
      queryClient.invalidateQueries({ queryKey: ["operating_expenses"] });
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
      await insertCostoVentaIfSold(forkliftId, toStatus);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
      queryClient.invalidateQueries({ queryKey: ["operating_expenses"] });
    },
  });
}
