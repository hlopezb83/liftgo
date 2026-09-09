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
 * El estado de la unidad es canónico: una reserva sólo compromete fechas y la
 * entrega completada es el evento que cambia `forklifts.status` a `rented`.
 * Mantener `bookings` y `todayYmd` en la firma evita romper consumidores que
 * todavía los usan para disponibilidad de calendario, pero no derivamos el
 * ciclo de vida de la unidad a partir de esas consultas.
 */
export function computeFleetAvailability(
  forklifts: ForkliftLike[] | undefined,
  _bookings: BookingLike[] | undefined,
  _todayYmd?: string,
): FleetAvailability | null {
  if (!forklifts) return null;

  const rentedForkliftIds = new Set(
    forklifts
      .filter((forklift) => forklift.status === FORKLIFT_STATUS.rented)
      .map((forklift) => forklift.id),
  );

  const isActive = (status: string) =>
    status !== FORKLIFT_STATUS.retired && status !== FORKLIFT_STATUS.sold;
  const maintenance = forklifts.filter((f) => f.status === FORKLIFT_STATUS.maintenance).length;
  const rented = forklifts.filter((f) => f.status === FORKLIFT_STATUS.rented).length;
  const available = forklifts.filter((f) => f.status === FORKLIFT_STATUS.available).length;
  const totalActive = forklifts.filter((f) => isActive(f.status)).length;

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
