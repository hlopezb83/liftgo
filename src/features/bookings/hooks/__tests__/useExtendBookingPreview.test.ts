import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * BL-A1 (v7.120.0): `useExtendBookingPreview` debe calcular totales con IVA
 * mexicano (16%), no con el literal 21% heredado. Este test cubre la regresión
 * ejercitando el hook con un mock de forklifts y verificando que el `taxAmount`
 * calculado corresponde a la tasa de dominio.
 */

const forkliftsData = [
  {
    id: "fk-1",
    daily_rate: 1000,
    weekly_rate: null,
    monthly_rate: null,
    name: "Toyota A",
  },
];

vi.mock("@/features/fleet", () => ({
  useForklifts: () => ({ data: forkliftsData }),
}));

// Aísla la lógica de generateLineItems para que el test valide solo la tasa.
vi.mock("@/lib/domain/invoiceHelpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domain/invoiceHelpers")>(
    "@/lib/domain/invoiceHelpers",
  );
  return {
    ...actual,
    generateLineItems: () => [
      { description: "Renta", quantity: 1, unit_price: 1000, total: 1000 },
    ],
  };
});

import { useExtendBookingPreview } from "../bookingActions/useExtendBookingPreview";
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
    const result = useExtendBookingPreview(booking, new Date("2026-08-31"));
    expect(result).not.toBeNull();
    expect(result!.subtotal).toBe(1000);
    // 16% de 1000 = 160 (no 210, que sería el bug previo).
    expect(result!.taxAmount).toBe(160);
    expect(result!.total).toBe(1160);
  });

  it("regresa null cuando no hay fecha o forklift", () => {
    expect(useExtendBookingPreview(booking, undefined)).toBeNull();
  });
});
