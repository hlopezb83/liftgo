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
      bookingRates: null,
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

  it("expone el mismo tramo inclusivo y las partidas canónicas del cálculo", () => {
    const result = useExtendBookingPreview(booking, new Date("2026-08-20T12:00:00"));
    expect(result!.range).toEqual({ start: "2026-08-16", end: "2026-08-20", days: 5 });
    expect(result!.items).toEqual(buildExtensionLineItems({
      originalEndDate: booking.end_date,
      newEndDate: "2026-08-20",
      forkliftRates: forkliftsData[0],
      bookingRates: booking,
      forkliftName: "Toyota A",
      serialNumber: "SN-1",
    }));
    expect(result!.items[0].clave_unidad).toBe("DAY");
    expect(result!.rateSource).toBe("catalog");
    expect(result!.taxRate).toBe(16);
    expect(result!.currency).toBe("MXN");
  });

  it("muestra la semana pactada y conserva la moneda sin sustituir la tarifa por catálogo", () => {
    const agreedBooking = {
      ...booking, end_date: "2026-10-31", daily_rate: 0, weekly_rate: 4500, monthly_rate: 0, currency: "USD",
    } as BookingWithForklift;
    const result = useExtendBookingPreview(agreedBooking, new Date("2026-11-07T12:00:00"));
    expect(result!.range).toEqual({ start: "2026-11-01", end: "2026-11-07", days: 7 });
    expect(result!.items[0]).toMatchObject({ quantity: 1, unit_price: 4500, total: 4500, rate_type: "weekly", clave_unidad: "WEE" });
    expect(result).toMatchObject({ subtotal: 4500, taxAmount: 720, total: 5220, currency: "USD", rateSource: "booking" });
  });

  it("identifica el contrato pactado también al derivar una tarifa diaria desde la mensual", () => {
    const agreedBooking = { ...booking, daily_rate: 0, weekly_rate: 0, monthly_rate: 15000 } as BookingWithForklift;
    const result = useExtendBookingPreview(agreedBooking, new Date("2026-08-20T12:00:00"));
    expect(result).toMatchObject({ rateSource: "booking", subtotal: 2500 });
    expect(result!.items[0]).toMatchObject({ quantity: 5, unit_price: 500, clave_unidad: "DAY" });
  });

  it.each(["2026-08-15", "2026-08-14"])("no produce un estimado para un fin que no añade días (%s)", (end) => {
    expect(useExtendBookingPreview(booking, new Date(`${end}T12:00:00`))).toBeNull();
  });

  it("no calcula partidas ni días NaN para una fecha inválida", () => {
    expect(useExtendBookingPreview(booking, new Date(Number.NaN))).toBeNull();
  });
});
