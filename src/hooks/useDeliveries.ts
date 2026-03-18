import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

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
      toast.error("Error al crear entrega", { description: err.message });
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
      toast.error("Error al actualizar entrega", { description: err.message });
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
