import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (delivery: TablesInsert<"deliveries">) => {
      const { data, error } = await supabase.from("deliveries").insert(delivery).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliveries"] }),
    onError: (err: Error) => {
      import("@/hooks/use-toast").then(({ toast }) =>
        toast({ title: "Error al crear entrega", description: err.message, variant: "destructive" })
      );
    },
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
    onError: (err: Error) => {
      import("@/hooks/use-toast").then(({ toast }) =>
        toast({ title: "Error al actualizar entrega", description: err.message, variant: "destructive" })
      );
    },
  });
}

export function useDeleteDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deliveries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}
