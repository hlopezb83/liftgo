import { useForklifts } from "@/features/fleet";
import { generateLineItems, computeTotals } from "@/lib/domain/invoiceHelpers";
import { toYMD } from "@/lib/format/dateFormats";
import { DEFAULT_VAT_RATE } from "@/lib/money";
import type { BookingWithForklift } from "../bookings/useBookings";

/**
 * Cálculo derivado del preview de extensión de reserva.
 * Memoizado para evitar recomputar en cada render.
 *
 * BL-A1 (v7.120.0): usa la tasa de IVA de dominio (México = 16%) en lugar del
 * literal 21 heredado de una plantilla foránea. `computeTotals` recibe el
 * porcentaje entero, por lo que se multiplica DEFAULT_VAT_RATE (0.16) × 100.
 */
export function useExtendBookingPreview(
  booking: BookingWithForklift,
  newEndDate: Date | undefined,
) {
  const { data: forklifts } = useForklifts();
  return (() => {
    const forklift = forklifts?.find((f) => f.id === booking.forklift_id);
    if (!forklift || !newEndDate) return null;
    const endYMD = toYMD(newEndDate);
    if (!endYMD) return null;
    const items = generateLineItems(forklift, booking.start_date, endYMD);
    const totals = computeTotals(items, DEFAULT_VAT_RATE * 100);
    // R9 Bloque 3: propagamos la moneda del booking para que el preview
    // formatee "US$29,000.00" en rentas USD (antes se mostraba con símbolo
    // MXN sin código, engañando al usuario).
    return { ...totals, currency: booking.currency ?? "MXN" };
  })();
}
