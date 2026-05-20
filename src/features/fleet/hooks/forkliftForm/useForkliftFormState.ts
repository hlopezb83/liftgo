import { useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useEquipmentModels } from "@/features/fleet/hooks/useEquipmentModels";
import type { ForkliftFormData } from "@/lib/formSchemas";
import type { Tables } from "@/integrations/supabase/types";

type ExistingForklift = Tables<"forklifts"> | null | undefined;

/**
 * Estado derivado puro para el formulario de montacargas.
 * Sin useState: depende de los valores reactivos de react-hook-form.
 */
export function useForkliftFormState(
  form: UseFormReturn<ForkliftFormData>,
  existing: ExistingForklift,
) {
  const { data: equipmentModels } = useEquipmentModels();
  const manufacturer = form.watch("manufacturer");

  const hasModels = !!(equipmentModels && equipmentModels.length > 0);

  const manufacturers = useMemo(() => {
    if (!equipmentModels) return [];
    const set = new Set(equipmentModels.map((m) => m.manufacturer));
    if (existing?.manufacturer && !set.has(existing.manufacturer)) set.add(existing.manufacturer);
    return [...set].sort();
  }, [equipmentModels, existing]);

  const filteredModels = useMemo(() => {
    if (!equipmentModels || !manufacturer) return [];
    const models = equipmentModels.filter((m) => m.manufacturer === manufacturer);
    if (existing?.model && existing?.manufacturer === manufacturer && !models.some((m) => m.model === existing.model)) {
      models.push({
        id: "fallback", manufacturer, model: existing.model,
        default_capacity_kg: null, default_mast_height_m: null, default_fuel_type: "Diesel",
        default_daily_rate: 0, default_weekly_rate: 0, default_monthly_rate: 0,
        created_at: "", updated_at: "",
      });
    }
    return models;
  }, [equipmentModels, manufacturer, existing]);

  return { equipmentModels, hasModels, manufacturers, filteredModels };
}
