import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { equipmentModelKeys } from "../lib/queryKeys";

const sel = (value: string): string => value;

const EQUIPMENT_MODEL_COLUMNS = sel(
  "id, catalog_model_id, local_alias, is_active, manufacturer, model, default_capacity_kg, default_mast_height_m, default_fuel_type, created_at, updated_at, default_daily_rate, default_weekly_rate, default_monthly_rate, is_e2e, e2e_scope, organization_id",
);

const CATALOG_COLUMNS = sel(
  "id, manufacturer, model, capacity_kg, mast_height_m, fuel_type, specifications, image_url, spec_sheet_url, is_active, source_organization_id, source_record_id, created_by, updated_by, created_at, updated_at",
);

export type EquipmentModel = Tables<"equipment_models">;
export type EquipmentModelCatalog = Tables<"equipment_model_catalog">;

export type ActivateEquipmentModelInput = {
  catalog_model_id: string;
  local_alias?: string | null;
  default_daily_rate?: number;
  default_weekly_rate?: number;
  default_monthly_rate?: number;
};

type LocalEquipmentModelInput = {
  local_alias?: string | null;
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
        .eq("is_active", true)
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

export function useEquipmentModelCatalog() {
  return useQuery({
    queryKey: equipmentModelKeys.catalog(),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EquipmentModelCatalog[]> => {
      const { data, error } = await supabase
        .from("equipment_model_catalog")
        .select(CATALOG_COLUMNS)
        .eq("is_active", true)
        .order("manufacturer")
        .order("model")
        .returns<EquipmentModelCatalog[]>();
      if (error) throw error;
      return data;
    },
  });
}

export function useActivateEquipmentModel() {
  return useEntityMutation<ActivateEquipmentModelInput, string>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc("activate_equipment_model_catalog", {
        p_catalog_model_id: input.catalog_model_id,
        p_local_alias: input.local_alias ?? undefined,
        p_daily_rate: input.default_daily_rate ?? 0,
        p_weekly_rate: input.default_weekly_rate ?? 0,
        p_monthly_rate: input.default_monthly_rate ?? 0,
      });
      if (error) throw error;
      return data;
    },
    invalidateKeys: [equipmentModelKeys.all],
    errorTitle: "Error al habilitar modelo",
  });
}

export function useUpdateEquipmentModel() {
  return useEntityMutation<LocalEquipmentModelInput & { id: string }, EquipmentModel>({
    mutationFn: async ({ id, ...input }) => {
      const { data, error } = await supabase
        .from("equipment_models")
        .update(input)
        .eq("id", id)
        .select(EQUIPMENT_MODEL_COLUMNS)
        .single();
      if (error) throw error;
      return data as unknown as EquipmentModel;
    },
    invalidateKeys: [equipmentModelKeys.all],
    errorTitle: "Error al actualizar la configuración local",
  });
}

/** Conserva el nombre público durante la transición; ahora desactiva localmente. */
export function useDeleteEquipmentModel() {
  return useEntityMutation<string, void>({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from("equipment_models")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    invalidateKeys: [equipmentModelKeys.all],
    errorTitle: "Error al desactivar el modelo",
  });
}
