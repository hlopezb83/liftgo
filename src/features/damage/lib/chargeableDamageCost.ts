import type { DamageRecordWithJoins } from "@/types/rental";

/**
 * Devuelve el costo cobrable de un daño (BL v7.90.0).
 *
 * - `repaired` con `actual_cost` → costo real de la reparación (manda).
 * - `repaired` sin `actual_cost` → cae al estimado (edge legacy).
 * - Un daño todavía no reparado nunca es cobrable. Esto evita que el estado
 *   de facturación sustituya la evidencia de reparación y libere la unidad.
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
  return null;
}
