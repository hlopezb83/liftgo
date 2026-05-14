import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { ForkliftFormData } from "@/lib/formSchemas";
import type { Tables } from "@/integrations/supabase/types";

type ExistingForklift = Tables<"forklifts"> | null | undefined;

export function useForkliftPrefill(
  existing: ExistingForklift,
  setForm: Dispatch<SetStateAction<ForkliftFormData>>,
) {
  useEffect(() => {
    if (!existing) return;
    setForm({
      name: existing.name,
      model: existing.model,
      manufacturer: existing.manufacturer || "",
      year: existing.year?.toString() || "",
      capacity_kg: existing.capacity_kg?.toString() || "",
      mast_height_m: existing.mast_height_m?.toString() || "",
      fuel_type: existing.fuel_type || "Diesel",
      serial_number: existing.serial_number || "",
      status: existing.status,
      daily_rate: existing.daily_rate?.toString() || "",
      weekly_rate: existing.weekly_rate?.toString() || "",
      monthly_rate: existing.monthly_rate?.toString() || "",
      acquisition_cost: existing.acquisition_cost?.toString() || "",
      notes: existing.notes || "",
      insurance_provider: existing.insurance_provider || "",
      insurance_policy_number: existing.insurance_policy_number || "",
      insurance_expiry: existing.insurance_expiry || "",
      insurance_cost: existing.insurance_cost?.toString() || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing]);
}
