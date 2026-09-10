import { FORKLIFT_STATUS } from "@/lib/constants";

type ForkliftLike = { id: string; status: string };
type BookingLike = { forklift_id: string; status: string; start_date: string; end_date: string };

export interface FleetAvailability {
  /** IDs de unidades cuyo estado canónico persistido es `rented`. */
  rentedForkliftIds: Set<string>;
  rented: number;
  available: number;
  maintenance: number;
  totalActive: number;
}

/**
 * El estado persistido de la unidad sigue mandando para mantenimiento, retiro
 * y venta, pero una unidad `available` con reserva confirmada VIGENTE hoy se
 * cuenta como ocupada.
 *
 * Motivo (bug del tablero, 2026-09-10): cerrar la entrega es el único evento
 * que pasa `forklifts.status` a `rented`; con 21 entregas nunca cerradas el
 * tablero reportaba como disponibles unidades que llevaban meses en campo.
 * Contar la ocupación real evita volver a "vender" equipo ya entregado.
 */
export function computeFleetAvailability(
  forklifts: ForkliftLike[] | undefined,
  bookings: BookingLike[] | undefined,
  todayYmd?: string,
): FleetAvailability | null {
  if (!forklifts) return null;

  const occupiedByBooking = new Set<string>();
  if (todayYmd && bookings) {
    for (const b of bookings) {
      if (b.status !== "confirmed") continue;
      if (b.start_date <= todayYmd && b.end_date >= todayYmd) occupiedByBooking.add(b.forklift_id);
    }
  }

  const effectiveStatus = (forklift: ForkliftLike) =>
    forklift.status === FORKLIFT_STATUS.available && occupiedByBooking.has(forklift.id)
      ? FORKLIFT_STATUS.rented
      : forklift.status;

  const statuses = forklifts.map((f) => ({ id: f.id, status: effectiveStatus(f) }));

  const rentedForkliftIds = new Set(
    statuses.filter((f) => f.status === FORKLIFT_STATUS.rented).map((f) => f.id),
  );

  const isActive = (status: string) =>
    status !== FORKLIFT_STATUS.retired && status !== FORKLIFT_STATUS.sold;
  const maintenance = statuses.filter((f) => f.status === FORKLIFT_STATUS.maintenance).length;
  const rented = statuses.filter((f) => f.status === FORKLIFT_STATUS.rented).length;
  const available = statuses.filter((f) => f.status === FORKLIFT_STATUS.available).length;
  const totalActive = statuses.filter((f) => isActive(f.status)).length;

  return { rentedForkliftIds, rented, available, maintenance, totalActive };
}

/**
 * R9-05: estado a MOSTRAR en el detalle de una unidad.
 *
 * El detalle presenta el estado canónico persistido. Las reservas futuras no
 * cambian la unidad a `rented`; sólo completar una entrega puede hacerlo.
 */
export function deriveForkliftDisplayStatus(
  forklift: ForkliftLike | undefined | null,
  _availability: FleetAvailability | null,
): string | undefined {
  return forklift?.status;
}
