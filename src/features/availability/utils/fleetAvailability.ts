import { parseISO, isWithinInterval } from "date-fns";
import { BOOKING_STATUS, FORKLIFT_STATUS } from "@/lib/constants";
import { nowMty } from "@/lib/utils";

type ForkliftLike = { id: string; status: string };
type BookingLike = { forklift_id: string; status: string; start_date: string; end_date: string };

export interface FleetAvailability {
  /** IDs de unidades con reserva confirmed que cubre hoy (TZ Monterrey). */
  rentedForkliftIds: Set<string>;
  rented: number;
  available: number;
  maintenance: number;
  totalActive: number;
}

/**
 * R6-FE-07 (N6-ADM-01/N6-DIS-06): ÚNICA definición de "rentado" del frontend.
 * Rentado = booking `confirmed` que cubre hoy (TZ Monterrey, cliente).
 * Antes había 3 definiciones: Panel (CURRENT_DATE del servidor DB, TZ +08),
 * Calendario (nowMty en cliente) y /fleet (status crudo desincronizado).
 * `maintenance`/`retired`/`sold` mandan sobre la reserva.
 */
export function computeFleetAvailability(
  forklifts: ForkliftLike[] | undefined,
  bookings: BookingLike[] | undefined,
): FleetAvailability | null {
  if (!forklifts) return null;

  const today = nowMty();
  const rentedForkliftIds = new Set<string>();
  bookings?.forEach((b) => {
    if (b.status !== BOOKING_STATUS.confirmed) return;
    try {
      const start = parseISO(b.start_date);
      const end = parseISO(b.end_date);
      if (isWithinInterval(today, { start, end })) rentedForkliftIds.add(b.forklift_id);
    } catch { /* skip invalid dates */ }
  });

  const isActive = (status: string) =>
    status !== FORKLIFT_STATUS.retired && status !== FORKLIFT_STATUS.sold;
  const maintenance = forklifts.filter((f) => f.status === FORKLIFT_STATUS.maintenance).length;
  // Una unidad en mantenimiento no cuenta como rentada aunque tenga reserva.
  const rented = forklifts.filter(
    (f) => isActive(f.status) && f.status !== FORKLIFT_STATUS.maintenance && rentedForkliftIds.has(f.id),
  ).length;
  const available = forklifts.filter(
    (f) => isActive(f.status) && f.status !== FORKLIFT_STATUS.maintenance && !rentedForkliftIds.has(f.id),
  ).length;
  const totalActive = forklifts.filter((f) => isActive(f.status)).length;

  return { rentedForkliftIds, rented, available, maintenance, totalActive };
}

/**
 * R9-05: estado a MOSTRAR en el detalle de una unidad.
 *
 * El `status` crudo se desincroniza (una unidad `available` con reserva
 * vigente, o `rented` sin ella). Sólo se deriva para el par available/rented:
 * `maintenance`, `retired` y `sold` son estados explícitos que mandan.
 *
 * Extraído de ForkliftDetail para poder probarlo sin montar la página.
 */
export function deriveForkliftDisplayStatus(
  forklift: ForkliftLike | undefined | null,
  availability: FleetAvailability | null,
): string | undefined {
  if (!forklift) return undefined;
  const derivable =
    forklift.status === FORKLIFT_STATUS.available || forklift.status === FORKLIFT_STATUS.rented;
  if (!availability || !derivable) return forklift.status;
  return availability.rentedForkliftIds.has(forklift.id)
    ? FORKLIFT_STATUS.rented
    : FORKLIFT_STATUS.available;
}
