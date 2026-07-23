import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { notifyError } from "@/lib/ui/appFeedback";
import type { Forklift } from "@/types/rental";
import { forkliftKeys, insuranceAlertsKeys, statusLogKeys } from "../../lib/queryKeys";

export function useCreateForklift() {
  return useEntityMutation({
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
    invalidateKeys: [forkliftKeys.all],
    errorTitle: "Error al crear montacargas",
  });
}

export function useUpdateForklift() {
  const queryClient = useQueryClient();
  // R-arq 9b: migrado a `useEntityMutation` para heredar toast/translateDbError
  // consistentes. El `setQueryData` optimista se conserva vía `onSuccess` custom.
  return useEntityMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"forklifts"> & { id: string }) => {
      const { data, error } = await supabase.from("forklifts").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [insuranceAlertsKeys.all],
    errorTitle: "Error al actualizar montacargas",
    onSuccess: (data) => {
      queryClient.setQueryData<Forklift[]>(forkliftKeys.lists(), (old) =>
        old ? old.map((f) => (f.id === data.id ? { ...f, ...data } : f)) : old
      );
      queryClient.setQueryData(forkliftKeys.detail(data.id), data);
    },
  });
}

export function useDeleteForklift() {
  // R-arq 9b: mantenemos el patrón optimista (requiere `onMutate` que
  // `useEntityMutation` no expone), pero añadimos `notifyError` para no
  // silenciar fallos del RPC (renta activa, integridad referencial).
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
    onError: (err: Error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(forkliftKeys.lists(), context.previous);
      notifyError({ title: "Error al eliminar montacargas", error: err });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: forkliftKeys.all }),
  });
}


export function useUpdateStatus() {
  // R8 Bloque 3: la transición se delega al RPC `change_forklift_status`, que valida
  // renta activa, exige razón para maintenance/sold/retired e inserta el status_log
  // de forma atómica. `fromStatus` se mantiene en la firma por compatibilidad con los
  // consumidores existentes pero el RPC lo re-lee con FOR UPDATE.
  return useEntityMutation({
    mutationFn: async ({
      forkliftId, toStatus, note,
    }: { forkliftId: string; fromStatus?: string; toStatus: string; note?: string }) => {
      const { error } = await supabase.rpc("change_forklift_status", {
        p_forklift_id: forkliftId,
        p_new_status: toStatus,
        p_reason: note ?? undefined,
      });
      if (error) throw error;
    },
    invalidateKeys: [forkliftKeys.all, statusLogKeys.all],
    errorTitle: "Error al actualizar estado de montacargas",
  });
}
