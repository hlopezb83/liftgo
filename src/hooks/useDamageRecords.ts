import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DamageRecord = {
  id: string;
  inspection_id: string | null;
  forklift_id: string;
  booking_id: string | null;
  customer_id: string | null;
  description: string;
  estimated_cost: number;
  actual_cost: number;
  status: string;
  maintenance_log_id: string | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
};

export function useDamageRecords() {
  return useQuery({
    queryKey: ["damage_records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("damage_records")
        .select("*, forklifts(name, model), customers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as (DamageRecord & { forklifts: { name: string; model: string } | null; customers: { name: string } | null })[];
    },
  });
}

export function useCreateDamageRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (record: Partial<DamageRecord>) => {
      const { data, error } = await supabase.from("damage_records").insert(record as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["damage_records"] }),
  });
}

export function useUpdateDamageRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase.from("damage_records").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["damage_records"] }),
  });
}
