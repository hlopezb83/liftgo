import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

type DeliveryRow = Awaited<ReturnType<typeof fetchDeliveryDetail>>;
type DeliveryList = Awaited<ReturnType<typeof fetchDeliveryList>>;

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
  let query = supabase.from("deliveries").select("*, forklifts(name, model)").order("scheduled_date");
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
