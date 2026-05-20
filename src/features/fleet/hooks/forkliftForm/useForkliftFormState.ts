import { useCallback, useMemo, useState } from "react";
import { useEquipmentModels } from "@/features/fleet/hooks/useEquipmentModels";
import type { ForkliftFormData } from "@/lib/formSchemas";
import type { Tables } from "@/integrations/supabase/types";

const emptyForm: ForkliftFormData = {
  name: "", model: "", manufacturer: "", year: "", capacity_kg: "",
  mast_height_m: "", fuel_type: "Diesel", serial_number: "", status: "available",
  daily_rate: "", weekly_rate: "", monthly_rate: "", acquisition_cost: "", notes: "",
  insurance_provider: "", insurance_policy_number: "", insurance_expiry: "", insurance_cost: "",
};

type ExistingForklift = Tables<"forklifts"> | null | undefined;

export function useForkliftFormState(existing: ExistingForklift) {
  const { data: equipmentModels } = useEquipmentModels();
  const [form, setForm] = useState<ForkliftFormData>(emptyForm);
  const set = useCallback(<K extends keyof ForkliftFormData>(key: K, value: ForkliftFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const hasModels = !!(equipmentModels && equipmentModels.length > 0);

  const manufacturers = useMemo(() => {
    if (!equipmentModels) return [];
    const set = new Set(equipmentModels.map((m) => m.manufacturer));
    if (existing?.manufacturer && !set.has(existing.manufacturer)) set.add(existing.manufacturer);
    return [...set].sort();
  }, [equipmentModels, existing]);

  const filteredModels = useMemo(() => {
    if (!equipmentModels || !form.manufacturer) return [];
    const models = equipmentModels.filter((m) => m.manufacturer === form.manufacturer);
    if (existing?.model && existing?.manufacturer === form.manufacturer && !models.some((m) => m.model === existing.model)) {
      models.push({
        id: "fallback", manufacturer: form.manufacturer, model: existing.model,
        default_capacity_kg: null, default_mast_height_m: null, default_fuel_type: "Diesel",
        default_daily_rate: 0, default_weekly_rate: 0, default_monthly_rate: 0,
        created_at: "", updated_at: "",
      });
    }
    return models;
  }, [equipmentModels, form.manufacturer, existing]);

  return { form, set, setForm, equipmentModels, hasModels, manufacturers, filteredModels };
}
