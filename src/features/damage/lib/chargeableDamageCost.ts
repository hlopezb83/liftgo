import type { DamageRecordWithJoins } from "@/types/rental";
import { hasRecordedActualCost } from "./actualDamageCost";

/**
 * Devuelve el costo cobrable de un daño (BL v7.90.0).
 *
 * - `repaired` con valoración real → sugiere el costo interno de reparación.
 * - Sin valoración real (NULL o cero legacy) → no sugiere un cobro.
 * - Un daño todavía no reparado nunca es cobrable. Esto evita que el estado
 *   de facturación sustituya la evidencia de reparación y libere la unidad.
 * - Cualquier otro estado → `null` (no cobrable).
 *
 * El presupuesto no se registra como gasto de la OT. Un cero histórico por
 * defecto no es una valoración de reparación. El precio al cliente se revisa
 * en el formulario de factura; este valor es sólo su sugerencia de costo.
 */
export function chargeableDamageCost(
  record: Pick<DamageRecordWithJoins, "status" | "estimated_cost" | "actual_cost"> & { actual_cost_source?: string | null },
): number | null {
  if (record.status === "repaired" && hasRecordedActualCost(record)) {
    return Number(record.actual_cost);
  }
  return null;
}
