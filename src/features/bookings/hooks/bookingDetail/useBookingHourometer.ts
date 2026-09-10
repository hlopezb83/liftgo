/**
 * Bloque 3A: la lectura del horómetro debe ser la ÚLTIMA válida y completada,
 * no la primera que aparezca en la lista (el orden de la consulta no está
 * garantizado). Es como leer el último recibo de la gasolinera, no el primero
 * que sale de la cajuela.
 */
export interface DeliveryReading {
  type: string;
  hours_reading: number | null;
  status?: string | null;
  scheduled_date?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  id?: string | null;
}

export interface HourometerData {
  deliveryHours: number | null;
  pickupHours: number | null;
  hoursUsed: number | null;
}

const time = (value: string | null | undefined): number => {
  if (!value) return Number.NEGATIVE_INFINITY;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
};

/** Orden determinista: fecha completada/programada, luego created_at, luego id. */
export function pickLatestReading<T extends DeliveryReading>(
  rows: T[] | undefined,
  type: string,
): T | null {
  const valid = (rows ?? []).filter(
    (d) =>
      d.type === type &&
      d.hours_reading != null &&
      Number.isFinite(Number(d.hours_reading)) &&
      Number(d.hours_reading) >= 0 &&
      (d.status == null || d.status === "completed"),
  );
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => {
    const byDate =
      Math.max(time(b.completed_at), time(b.scheduled_date)) -
      Math.max(time(a.completed_at), time(a.scheduled_date));
    if (byDate !== 0) return byDate;
    const byCreated = time(b.created_at) - time(a.created_at);
    if (byCreated !== 0) return byCreated;
    return String(b.id ?? "").localeCompare(String(a.id ?? ""));
  });
  return sorted[0] ?? null;
}

export function computeHourometer(deliveries: DeliveryReading[] | undefined): HourometerData {
  const deliveryHours = pickLatestReading(deliveries, "delivery")?.hours_reading ?? null;
  const pickupHours = pickLatestReading(deliveries, "pickup")?.hours_reading ?? null;
  const hoursUsed =
    deliveryHours != null && pickupHours != null && pickupHours >= deliveryHours
      ? Math.round((pickupHours - deliveryHours) * 10) / 10
      : null;
  return { deliveryHours, pickupHours, hoursUsed };
}

export function useBookingHourometer(deliveries: DeliveryReading[] | undefined): HourometerData {
  return computeHourometer(deliveries);
}
