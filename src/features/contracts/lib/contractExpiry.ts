/**
 * Bloque 18b (R7): estado de vencimiento por contrato para mostrar en la lista.
 * - "expired" cuando end_date < hoy.
 * - "expiring_soon" cuando end_date ∈ [hoy, hoy+30d].
 * - null cuando el contrato está cancelado/borrador o aún no ha llegado la fecha.
 *
 * Se usa `parseDateLocal` para evitar el off-by-one de UTC → America/Monterrey.
 */
import { differenceInCalendarDays } from "date-fns";
import { nowMty, parseDateLocal } from "@/lib/utils";

export type ContractExpiryState = "expired" | "expiring_soon" | null;

const WARNING_WINDOW_DAYS = 30;

export function getContractExpiryState(
  endDate: string | null | undefined,
  status: string | null | undefined,
): ContractExpiryState {
  if (!endDate) return null;
  // Solo tiene sentido advertir vencimiento en contratos activos/firmados.
  if (status !== "signed" && status !== "sent") return null;
  const parsed = parseDateLocal(endDate);
  if (!parsed) return null;
  const days = differenceInCalendarDays(parsed, nowMty());
  if (days < 0) return "expired";
  if (days <= WARNING_WINDOW_DAYS) return "expiring_soon";
  return null;
}

export function getContractExpiryLabel(state: ContractExpiryState): string | null {
  if (state === "expired") return "Vencido";
  if (state === "expiring_soon") return "Por vencer";
  return null;
}
