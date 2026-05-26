import type { UseFormReturn } from "react-hook-form";
import type { ForkliftFormData } from "@/features/fleet/lib/forkliftFormSchema";
import type { Tables } from "@/integrations/supabase/types";
import { toStr, toNumStr } from "@/lib/coerce";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";

type ExistingForklift = Tables<"forklifts"> | null | undefined;

function mapForkliftToForm(f: Tables<"forklifts">): ForkliftFormData {
  return {
    name: f.name,
    model: f.model,
    manufacturer: toStr(f.manufacturer),
    year: toNumStr(f.year),
    capacity_kg: toNumStr(f.capacity_kg),
    mast_height_m: toNumStr(f.mast_height_m),
    fuel_type: toStr(f.fuel_type, "Diesel"),
    serial_number: toStr(f.serial_number),
    status: f.status,
    daily_rate: toNumStr(f.daily_rate),
    weekly_rate: toNumStr(f.weekly_rate),
    monthly_rate: toNumStr(f.monthly_rate),
    acquisition_cost: toNumStr(f.acquisition_cost),
    notes: toStr(f.notes),
    insurance_provider: toStr(f.insurance_provider),
    insurance_policy_number: toStr(f.insurance_policy_number),
    insurance_expiry: toStr(f.insurance_expiry),
    insurance_cost: toNumStr(f.insurance_cost),
  };
}

export function useForkliftPrefill(
  existing: ExistingForklift,
  form: UseFormReturn<ForkliftFormData>,
) {
  usePrefillEffect(() => {
    if (!existing) return;
    form.reset(mapForkliftToForm(existing));
  }, [existing]);
}
