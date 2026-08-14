import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { notifyError } from "@/lib/ui/appFeedback";
import { prospectKeys } from "../lib/queryKeys";
import { applyStageMove, type StageMove } from "../lib/stageMove";
import type { ProspectInsert, ProspectUpdate } from "./useProspects";
import type { Prospect } from "../lib/prospectTypes";

export function useCreateProspect() {
  return useEntityMutation({
    mutationFn: async (p: Omit<ProspectInsert, "stage_order" | "customer_id">) => {
      // R23-H: `next_stage_order` calcula el siguiente orden dentro de una
      // transacción con `pg_advisory_xact_lock`, eliminando la carrera de
      // concurrencia del patrón anterior (leer max, luego insertar).
      const { data: nextOrder, error: orderError } = await (supabase as any).rpc(
        "next_stage_order",
        { p_stage: p.stage },
      );
      if (orderError) throw orderError;
      const { data, error } = await supabase
        .from("prospects")
        .insert({ ...p, stage_order: nextOrder as number })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [prospectKeys.all],
    successMsg: "Prospecto creado",
    errorTitle: "Error al crear prospecto",
  });
}

export function useUpdateProspect() {
  return useEntityMutation({
    mutationFn: async ({ id, ...updates }: ProspectUpdate) => {
      const { data, error } = await supabase
        .from("prospects").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [prospectKeys.all],
    errorTitle: "Error al actualizar prospecto",
  });
}

export function useDeleteProspect() {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("prospects").delete().eq("id", id);
      if (error) throw error;
    },
    invalidateKeys: [prospectKeys.all],
    successMsg: "Prospecto eliminado",
    errorTitle: "Error al eliminar prospecto",
  });
}

/**
 * B-11 — Mueve un prospecto de columna en el Kanban con actualización
 * optimista: la tarjeta se reubica al soltar y, si el servidor falla,
 * se restaura el snapshot previo y se muestra el toast de error.
 */
const MOVE_PROSPECT_STAGE_KEY = ["prospects", "move-stage"] as const;


export function useMoveProspectStage() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, StageMove, { snapshots: [QueryKey, Prospect[] | undefined][] }>({
    mutationKey: MOVE_PROSPECT_STAGE_KEY,
    // R23-G: la RPC reindexa `stage_order` de la columna origen y destino en
    // una sola transacción. Antes sólo se escribía la tarjeta movida, dejando
    // órdenes duplicados (#0) y un orden persistido distinto al que veía el
    // usuario al recargar.
    mutationFn: async ({ id, newStage, newIndex }: StageMove) => {
      const { error } = await supabase.rpc("reorder_prospect_stage", {
        p_prospect_id: id,
        p_new_stage: newStage,
        p_new_index: newIndex,
      });
      if (error) throw error;
    },

    onMutate: async (move) => {
      await queryClient.cancelQueries({ queryKey: prospectKeys.all });
      const snapshots = queryClient.getQueriesData<Prospect[]>({ queryKey: prospectKeys.all });
      queryClient.setQueriesData<Prospect[]>({ queryKey: prospectKeys.all }, (old) =>
        old ? applyStageMove(old, move) : old,
      );
      return { snapshots };
    },
    onError: (error, _move, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      notifyError({ title: "Error al mover el prospecto", error });
    },
    // R23-C: con dos arrastres solapados, invalidar al terminar el primero
    // hacía que el refetch pisara el estado optimista del segundo y la tarjeta
    // "regresaba" ~700ms. Sólo invalidamos cuando ya no queda ningún movimiento
    // en vuelo (el actual todavía cuenta como 1 dentro de onSettled).
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: MOVE_PROSPECT_STAGE_KEY }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: prospectKeys.all });
    },
  });
}

