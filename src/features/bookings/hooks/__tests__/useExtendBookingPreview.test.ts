import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * BL-A1 (v7.120.0): `useExtendBookingPreview` debe calcular totales con IVA
 * mexicano (16%), no con el literal 21% heredado.
 *
 * Fix 8.3 (Sprint 8): además el preview debe cobrar SÓLO el tramo extendido
 * (`end_date + 1` … `new_end_date`), idéntico a la factura de extensión real,
 * no la renta completa desde `start_date`.
 */

const forkliftsData = [
  {
    id: "fk-1",
    daily_rate: 1000,
    weekly_rate: null,
    monthly_rate: null,
    name: "Toyota A",
    serial_number: "SN-1",
  },
];

vi.mock("@/features/fleet", () => ({
  useForklifts: () => ({ data: forkliftsData }),
}));

import { useExtendBookingPreview } from "../bookingActions/useExtendBookingPreview";
import { buildExtensionLineItems } from "../../lib/extensionBilling";
import type { BookingWithForklift } from "../bookings/useBookings";

const booking = {
  id: "bk-1",
  forklift_id: "fk-1",
  start_date: "2026-08-01",
  end_date: "2026-08-15",
} as unknown as BookingWithForklift;

describe("useExtendBookingPreview · BL-A1 IVA 16%", () => {
  beforeEach(() => vi.clearAllMocks());

  it("aplica IVA mexicano (16%) sobre el subtotal, no 21%", () => {
    // Extensión del 16 al 20 de agosto = 5 días × $1,000.
    const result = useExtendBookingPreview(booking, new Date("2026-08-20T12:00:00"));
    expect(result).not.toBeNull();
    expect(result!.subtotal).toBe(5000);
    expect(result!.taxAmount).toBe(800);
    expect(result!.total).toBe(5800);
  });

  it("cobra sólo el tramo extendido, no la renta completa", () => {
    // Renta de 3 meses + extensión de 5 días: el preview debe valer 5 días.
    const longBooking = {
      ...booking,
      start_date: "2026-05-01",
      end_date: "2026-07-31",
    } as unknown as BookingWithForklift;

    const result = useExtendBookingPreview(longBooking, new Date("2026-08-05T12:00:00"));
    expect(result).not.toBeNull();
    expect(result!.subtotal).toBe(5000);
  });

  it("coincide centavo a centavo con la factura de extensión real", () => {
    const items = buildExtensionLineItems({
      originalEndDate: "2026-08-15",
      newEndDate: "2026-08-20",
      forkliftRates: { daily_rate: 1000, weekly_rate: null, monthly_rate: null },
      bookingMonthlyRate: null,
      forkliftName: "Toyota A",
      serialNumber: "SN-1",
    });
    const invoiceSubtotal = items.reduce((acc, i) => acc + i.total, 0);
    const result = useExtendBookingPreview(booking, new Date("2026-08-20T12:00:00"));
    expect(result!.subtotal).toBe(invoiceSubtotal);
  });

  it("regresa null cuando no hay fecha o forklift", () => {
    expect(useExtendBookingPreview(booking, undefined)).toBeNull();
  });
});
