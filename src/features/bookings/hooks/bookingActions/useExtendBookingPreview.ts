
import { format } from "date-fns";
import { useForklifts } from "@/features/fleet";
import { generateLineItems, computeTotals } from "@/lib/domain/invoiceHelpers";
import type { BookingWithForklift } from "../useBookings";

/**
 * Cálculo derivado del preview de extensión de reserva.
 * Memoizado para evitar recomputar en cada render.
 */
export function useExtendBookingPreview(
  booking: BookingWithForklift,
  newEndDate: Date | undefined,
) {
  const { data: forklifts } = useForklifts();
  return (() => {
    const forklift = forklifts?.find((f) => f.id === booking.forklift_id);
    if (!forklift || !newEndDate) return null;
    const items = generateLineItems(forklift, booking.start_date, format(newEndDate, "yyyy-MM-dd"));
    return computeTotals(items, 21);
  })();
}
