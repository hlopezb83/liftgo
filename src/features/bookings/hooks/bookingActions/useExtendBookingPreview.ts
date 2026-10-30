import { useForklifts } from "@/features/fleet";
import { computeTotals } from "@/lib/domain/invoiceHelpers";
import { toYMD } from "@/lib/format/dateFormats";
import { DEFAULT_VAT_RATE } from "@/lib/money";
import { buildExtensionLineItems, extensionBillableRange, type ExtensionBillableRange } from "../../lib/extensionBilling";
import type { BookingWithForklift } from "../bookings/useBookings";

export interface BookingExtensionPreview {
  items: ReturnType<typeof buildExtensionLineItems>;
  range: ExtensionBillableRange;
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  taxRate: number;
  rateSource: "booking" | "catalog";
}

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
): BookingExtensionPreview | null {
  const { data: forklifts } = useForklifts();
  return (() => {
    const forklift = forklifts?.find((f) => f.id === booking.forklift_id);
    if (!forklift || !newEndDate || !Number.isFinite(newEndDate.getTime())) return null;
    const endYMD = toYMD(newEndDate);
    if (!endYMD) return null;
    const range = extensionBillableRange(booking.end_date, endYMD);
    if (!range) return null;
    // El preview comparte el contrato de tarifas con la facturación:
    // `buildExtensionLineItems` resuelve las pactadas o, si no hay ninguna,
    // las del catálogo, incluyendo los remanentes derivados.
    // Fix 8.3: el preview debe cobrar sólo el tramo extendido
    // (`original_end_date + 1` … `new_end_date`), igual que la factura real,
    // no la renta completa desde `start_date`.
    const items = buildExtensionLineItems({
      originalEndDate: booking.end_date,
      newEndDate: endYMD,
      forkliftRates: {
        daily_rate: forklift.daily_rate,
        weekly_rate: forklift.weekly_rate,
        monthly_rate: forklift.monthly_rate,
      },
      bookingRates: {
        daily_rate: booking.daily_rate,
        weekly_rate: booking.weekly_rate,
        monthly_rate: booking.monthly_rate,
      },
      forkliftName: forklift.name,
      serialNumber: forklift.serial_number,
    });
    if (items.length === 0) return null;
    const totals = computeTotals(items, DEFAULT_VAT_RATE * 100);
    // R9 Bloque 3: propagamos el código de moneda para que el preview lo
    // formatee explícitamente. Hoy `bookings` no persiste moneda propia
    // (todas las rentas se facturan en MXN); fallback a "MXN" preserva la UI
    // actual y deja la puerta abierta a rentas multi-moneda futuras.
    const currency =
      (booking as { currency?: string | null }).currency ?? "MXN";
    // The canonical resolver treats any positive agreed rate as the complete
    // booking contract, including derived daily remainders. Describe that
    // source without inventing a separately agreed daily/weekly price.
    const rateSource = [booking.daily_rate, booking.weekly_rate, booking.monthly_rate]
      .some((rate) => (Number(rate) || 0) > 0) ? "booking" : "catalog";
    return { ...totals, currency, items, range, taxRate: DEFAULT_VAT_RATE * 100, rateSource };
  })();
}
