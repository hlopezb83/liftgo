import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export function useDelivery(id?: string) {
  return useQuery({
    queryKey: ["deliveries", "detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("deliveries").select("*, forklifts(name, model)").eq("id", id ?? "").single();
      if (error) throw error;
      return data;
    },
  });
}

export function useDeliveries(bookingId?: string) {
  return useQuery({
    queryKey: ["deliveries", bookingId],
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase.from("deliveries").select("*, forklifts(name, model)").order("scheduled_date");
      if (bookingId) query = query.eq("booking_id", bookingId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (delivery: Omit<TablesInsert<"deliveries">, "delivery_number">) => {
      const { data, error } = await supabase.from("deliveries").insert(delivery as TablesInsert<"deliveries">).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deliveries"] }),
    onError: (err: Error) => {
      notifyError({ title: "Error al crear entrega", error: err });
    },
  });
}

export function useUpdateDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"deliveries"> & { id: string }) => {
      const { data, error } = await supabase.from("deliveries").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deliveries"] }),
    onError: (err: Error) => {
      notifyError({ title: "Error al actualizar entrega", error: err });
    },
  });
}

export function useDeleteDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deliveries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}
