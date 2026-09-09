import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";
import { LIST_FETCH_LIMIT } from "@/lib/supabase/constants";

type DeliveryRow = Awaited<ReturnType<typeof fetchDeliveryDetail>>;
type DeliveryList = Awaited<ReturnType<typeof fetchDeliveryList>>;

export type CompleteDeliveryInput = {
  id: string;
  signature_base64?: string;
  hours_reading?: number;
  completed_no_evidence_reason?: string;
};

async function fetchDeliveryDetail(id: string) {
  const { data, error } = await supabase
    .from("deliveries")
    .select("*, forklifts(name, model)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

async function fetchDeliveryList(bookingId?: string) {
  let query = supabase.from("deliveries").select("*, forklifts(name, model)").order("scheduled_date").limit(LIST_FETCH_LIMIT);
  if (bookingId) query = query.eq("booking_id", bookingId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export const deliveryQueries = defineEntityQueries<"deliveries", DeliveryList, DeliveryRow>(
  "deliveries",
  {
    list: (filter) => async () => {
      const bookingId = filter?.bookingId as string | null | undefined;
      return fetchDeliveryList(bookingId ?? undefined);
    },
    detail: (id: string) => async () => fetchDeliveryDetail(id),
  },
);

export const deliveryKeys = deliveryQueries.keys;

export function useDelivery(id?: string) {
  return useQuery({
    ...deliveryQueries.detail(id ?? ""),
    enabled: !!id,
  });
}

export function useDeliveries(bookingId?: string) {
  return useQuery(deliveryQueries.list({ bookingId: bookingId ?? null }));
}

export function useCreateDelivery() {
  return useEntityMutation({
    mutationFn: async (delivery: Omit<TablesInsert<"deliveries">, "delivery_number">) => {
      const { data, error } = await supabase.from("deliveries").insert(delivery as TablesInsert<"deliveries">).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [deliveryKeys.all],
    errorTitle: "Error al crear entrega",
  });
}

export function useUpdateDelivery() {
  return useEntityMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"deliveries"> & { id: string }) => {
      const { data, error } = await supabase.from("deliveries").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [deliveryKeys.all],
    errorTitle: "Error al actualizar entrega",
  });
}

/**
 * Completa la entrega mediante la frontera transaccional de dominio. La RPC
 * bloquea reserva, entrega y unidad antes de validar la transición, evitando
 * que una vista obsoleta reviva una entrega cancelada o rente una unidad que
 * entró a mantenimiento en otra sesión.
 */
export function useCompleteDelivery() {
  return useEntityMutation({
    mutationFn: async ({
      id,
      signature_base64,
      hours_reading,
      completed_no_evidence_reason,
    }: CompleteDeliveryInput) => {
      return callRpc<Tables<"deliveries">>("complete_delivery", {
        p_delivery_id: id,
        p_signature_base64: signature_base64,
        p_hours_reading: hours_reading,
        p_completed_no_evidence_reason: completed_no_evidence_reason,
      });
    },
    invalidateKeys: [deliveryKeys.all, ["forklifts"] as const, ["status_logs"] as const],
    errorTitle: "Error al completar entrega",
  });
}

export function useDeleteDelivery() {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deliveries").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    invalidateKeys: [deliveryKeys.all],
    errorTitle: "Error al eliminar entrega",
  });
}
