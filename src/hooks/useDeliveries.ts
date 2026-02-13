import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export function useDeliveries(bookingId?: string) {
  return useQuery({
    queryKey: ["deliveries", bookingId],
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (delivery: TablesInsert<"deliveries">) => {
      const { data, error } = await supabase.from("deliveries").insert(delivery).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}

export function useUpdateDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"deliveries"> & { id: string }) => {
      const { data, error } = await supabase.from("deliveries").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}
