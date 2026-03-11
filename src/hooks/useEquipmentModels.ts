import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import type { Tables } from "@/integrations/supabase/types";

export type EquipmentModel = Tables<"equipment_models">;

type EquipmentModelInput = {
  manufacturer: string;
  model: string;
  default_capacity_kg?: number | null;
  default_mast_height_m?: number | null;
  default_fuel_type?: string;
  default_daily_rate?: number;
  default_weekly_rate?: number;
  default_monthly_rate?: number;
};

export function useEquipmentModels() {
  return useQuery({
    queryKey: ["equipment_models"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_models")
        .select("*")
        .order("manufacturer")
        .order("model");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateEquipmentModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EquipmentModelInput) => {
      const { data, error } = await supabase.from("equipment_models").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment_models"] }),
  });
}

export function useUpdateEquipmentModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: EquipmentModelInput & { id: string }) => {
      const { data, error } = await supabase.from("equipment_models").update(input).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment_models"] }),
  });
}

export function useDeleteEquipmentModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("equipment_models").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment_models"] }),
  });
}
