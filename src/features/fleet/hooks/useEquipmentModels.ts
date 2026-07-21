import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { equipmentModelKeys } from "../lib/queryKeys";

const sel = (s: string): string => s;

const EQUIPMENT_MODEL_COLUMNS = sel(
  "id, manufacturer, model, default_capacity_kg, default_mast_height_m, default_fuel_type, created_at, updated_at, default_daily_rate, default_weekly_rate, default_monthly_rate, is_e2e, e2e_scope"
);

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

export const equipmentModelQueries = defineEntityQueries<"equipment_models", EquipmentModel[], never>(
  "equipment_models",
  {
    staleTime: 5 * 60_000,
    list: () => async () => {
      const { data, error } = await supabase
        .from("equipment_models")
        .select(EQUIPMENT_MODEL_COLUMNS)
        .or("is_e2e.is.null,is_e2e.eq.false")
        .order("manufacturer")
        .order("model")
        .returns<EquipmentModel[]>();
      if (error) throw error;
      return data;
    },
  },
);

export function useEquipmentModels() {
  return useQuery(equipmentModelQueries.list());
}

export function useCreateEquipmentModel() {
  return useEntityMutation({
    mutationFn: async (input: EquipmentModelInput) => {
      const { data, error } = await supabase.from("equipment_models").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [equipmentModelKeys.all],
    errorTitle: "Error al crear modelo",
  });
}

export function useUpdateEquipmentModel() {
  return useEntityMutation({
    mutationFn: async ({ id, ...input }: EquipmentModelInput & { id: string }) => {
      const { data, error } = await supabase.from("equipment_models").update(input).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [equipmentModelKeys.all],
    errorTitle: "Error al actualizar modelo",
  });
}

export function useDeleteEquipmentModel() {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("equipment_models").delete().eq("id", id);
      if (error) throw error;
    },
    invalidateKeys: [equipmentModelKeys.all],
    errorTitle: "Error al eliminar modelo",
  });
}
