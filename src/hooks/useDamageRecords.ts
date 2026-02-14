import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type DamageRecord = Tables<"damage_records">;

export function useDamageRecords() {
  return useQuery({
    queryKey: ["damage_records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("damage_records")
        .select("*, forklifts(name, model), customers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateDamageRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (record: TablesInsert<"damage_records">) => {
      const { data, error } = await supabase.from("damage_records").insert(record).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["damage_records"] }),
  });
}

export function useUpdateDamageRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"damage_records"> & { id: string }) => {
      const { data, error } = await supabase.from("damage_records").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["damage_records"] }),
  });
}
