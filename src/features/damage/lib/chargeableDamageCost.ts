import type { DamageRecordWithJoins } from "@/types/rental";

/**
 * Devuelve el costo cobrable de un daño (BL v7.90.0).
 *
 * - `repaired` con `actual_cost` → costo real de la reparación (manda).
 * - `repaired` sin `actual_cost` → cae al estimado (edge legacy).
 * - `reported` (no reparado aún) → cobra el estimado como anticipo.
 * - Cualquier otro estado, o sin ambos costos → `null` (no cobrable).
 *
 * Regla: la orden de mantenimiento se crea con el estimado (es el presupuesto);
 * la factura al cliente debe reflejar el costo final cuando ya lo conocemos.
 */
export function chargeableDamageCost(
  record: Pick<DamageRecordWithJoins, "status" | "estimated_cost" | "actual_cost">,
): number | null {
  const estimated = record.estimated_cost ?? null;
  const actual = record.actual_cost ?? null;

  if (record.status === "repaired") {
    const value = actual ?? estimated;
    return value != null ? Number(value) : null;
  }
  if (record.status === "reported") {
    return estimated != null ? Number(estimated) : null;
  }
  return null;
}
