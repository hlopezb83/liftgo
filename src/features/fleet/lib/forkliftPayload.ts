import { roundMoney } from "@/lib/money";
import type { ForkliftFormData } from "./forkliftFormSchema";

type SelectableModel = { id: string; manufacturer: string; model: string };

export function resolveEquipmentModelId(
  form: Pick<ForkliftFormData, "manufacturer" | "model">,
  models: readonly SelectableModel[] | undefined,
): string | null {
  const matches = models?.filter(
    (item) => item.manufacturer === form.manufacturer && item.model === form.model,
  ) ?? [];
  return matches.length === 1 ? matches[0].id : null;
}

const numOrNull = (v: string) => (v ? parseFloat(v) : null);
// Frontera de persistencia monetaria: las tarifas/costos se redondean a 2
// decimales con la regla del repo (currency.js) — parseFloat crudo admitía
// 3+ decimales que luego desalineaban totales y comparaciones de saldo.
const moneyOrNull = (v: string) => (v ? roundMoney(parseFloat(v)) : null);
const moneyOrZero = (v: string) => (v ? roundMoney(parseFloat(v)) : 0);

/**
 * Al editar sin cambiar fabricante/modelo, conserva el vínculo existente
 * (aunque el modelo esté inactivo o sea legado) para no bloquear el guardado.
 */
export function resolveEquipmentModelIdForSave(
  form: Pick<ForkliftFormData, "manufacturer" | "model">,
  models: readonly SelectableModel[] | undefined,
  existing?: { manufacturer: string | null; model: string; equipment_model_id: string | null } | null,
): { ok: true; id: string | null } | { ok: false } {
  const resolved = resolveEquipmentModelId(form, models);
  if (resolved) return { ok: true, id: resolved };
  if (existing && (existing.manufacturer ?? "") === form.manufacturer && existing.model === form.model) {
    return { ok: true, id: existing.equipment_model_id };
  }
  return { ok: false };
}

export function buildForkliftPayload(form: ForkliftFormData, equipmentModelId: string | null) {
  return {
    name: form.name,
    model: form.model,
    equipment_model_id: equipmentModelId,
    manufacturer: form.manufacturer || null,
    year: form.year ? parseInt(form.year) : null,
    capacity_kg: numOrNull(form.capacity_kg),
    mast_height_m: numOrNull(form.mast_height_m),
    fuel_type: form.fuel_type,
    serial_number: form.serial_number || null,
    status: form.status,
    daily_rate: moneyOrZero(form.daily_rate),
    weekly_rate: moneyOrZero(form.weekly_rate),
    monthly_rate: moneyOrZero(form.monthly_rate),
    acquisition_cost: moneyOrZero(form.acquisition_cost),
    notes: form.notes || null,
    insurance_provider: form.insurance_provider || null,
    insurance_policy_number: form.insurance_policy_number || null,
    insurance_expiry: form.insurance_expiry || null,
    insurance_cost: moneyOrNull(form.insurance_cost),
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
