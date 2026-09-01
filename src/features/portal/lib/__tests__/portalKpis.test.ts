import { describe, expect, it } from "vitest";
import { derivePortalKpis } from "../portalKpis";

const bookings = [{ status: "confirmed" }, { status: "completed" }];

describe("R8-03 · KPIs del portal con tipo de cambio", () => {
  it("matriz de monedas: excluye divisa sin TC válido (null, 0, negativo, 1)", () => {
    const { outstanding, fxMissingCount } = derivePortalKpis(bookings, [
      { status: "sent", balance: 100, moneda: "MXN", tipo_cambio: null },
      { status: "sent", balance: 100, moneda: "USD", tipo_cambio: null },
      { status: "sent", balance: 100, moneda: "USD", tipo_cambio: 0 },
      { status: "sent", balance: 100, moneda: "USD", tipo_cambio: -3 },
      { status: "sent", balance: 100, moneda: "USD", tipo_cambio: 1 },
      { status: "sent", balance: 100, moneda: "USD", tipo_cambio: 18 },
    ]);
    expect(outstanding).toBe(1900);
    expect(fxMissingCount).toBe(4);
  });

  it("ignora facturas pagadas y canceladas", () => {
    const { outstanding, fxMissingCount, activeBookings } = derivePortalKpis(bookings, [
      { status: "paid", balance: 500, moneda: "USD", tipo_cambio: 1 },
      { status: "cancelled", balance: 500, moneda: "USD", tipo_cambio: null },
      { status: "overdue", balance: 200, moneda: "MXN" },
    ]);
    expect(outstanding).toBe(200);
    expect(fxMissingCount).toBe(0);
    expect(activeBookings).toHaveLength(1);
  });
});
