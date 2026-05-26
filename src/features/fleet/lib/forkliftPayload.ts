import type { ForkliftFormData } from "@/lib/formSchemas";

const numOrNull = (v: string) => (v ? parseFloat(v) : null);
const numOrZero = (v: string) => (v ? parseFloat(v) : 0);

export function buildForkliftPayload(form: ForkliftFormData) {
  return {
    name: form.name,
    model: form.model,
    manufacturer: form.manufacturer || null,
    year: form.year ? parseInt(form.year) : null,
    capacity_kg: numOrNull(form.capacity_kg),
    mast_height_m: numOrNull(form.mast_height_m),
    fuel_type: form.fuel_type,
    serial_number: form.serial_number || null,
    status: form.status,
    daily_rate: numOrZero(form.daily_rate),
    weekly_rate: numOrZero(form.weekly_rate),
    monthly_rate: numOrZero(form.monthly_rate),
    acquisition_cost: numOrZero(form.acquisition_cost),
    notes: form.notes || null,
    insurance_provider: form.insurance_provider || null,
    insurance_policy_number: form.insurance_policy_number || null,
    insurance_expiry: form.insurance_expiry || null,
    insurance_cost: numOrNull(form.insurance_cost),
  };
}

interface UniquenessCheckInput {
  form: ForkliftFormData;
  others: { name: string; serial_number: string | null }[];
}

export function validateForkliftUniqueness({ form, others }: UniquenessCheckInput): string | null {
  if (others.some((f) => f.name === form.name)) {
    return "Ya existe un montacargas con este nombre";
  }
  if (form.serial_number && others.some((f) => f.serial_number === form.serial_number)) {
    return "Ya existe un montacargas con este número de serie";
  }
  return null;
}

export function mapForkliftMutationError(message: string): string {
  if (message?.includes("forklifts_name_unique")) return "Ya existe un montacargas con este nombre";
  if (message?.includes("forklifts_serial_number_unique")) return "Ya existe un montacargas con este número de serie";
  return message;
}
