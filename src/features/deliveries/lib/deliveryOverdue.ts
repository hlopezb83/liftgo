import { differenceInCalendarDays } from "date-fns";
import { toYMD } from "@/lib/date/toYMD";
import { nowMty, parseDateLocal } from "@/lib/utils";

type DeliveryLike = {
  status?: string | null;
  scheduled_date?: string | null;
};

/**
 * Ronda C (C2): una entrega "programada" con fecha pasada estaba invisible en
 * la lista — 25 registros llevaban días atrasados sin ninguna señal.
 *
 * Se usa `nowMty()` (reloj del negocio, America/Monterrey) y `parseDateLocal`
 * para evitar el corrimiento UTC que marcaba un día de más o de menos.
 */
export function deliveryOverdueDays(delivery: DeliveryLike): number {
  if (delivery.status !== "scheduled" && delivery.status !== "in_transit") return 0;
  const scheduled = delivery.scheduled_date ? parseDateLocal(delivery.scheduled_date) : null;
  const today = parseDateLocal(toYMD(nowMty()));
  if (!scheduled || !today) return 0;
  const days = differenceInCalendarDays(today, scheduled);
  return days > 0 ? days : 0;
}

export function isDeliveryOverdue(delivery: DeliveryLike): boolean {
  return deliveryOverdueDays(delivery) > 0;
}

export function countOverdueDeliveries(deliveries: ReadonlyArray<DeliveryLike> | null | undefined): number {
  return (deliveries ?? []).reduce((n, d) => (isDeliveryOverdue(d) ? n + 1 : n), 0);
}

/** Etiqueta corta para el badge de atraso ("Atrasada · 3 días"). */
export function deliveryOverdueLabel(days: number): string {
  return days === 1 ? "Atrasada · 1 día" : `Atrasada · ${days} días`;
}
