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

describe("R9-09 · fxMissingCount solo con saldo real", () => {
  it("divisa sin TC con saldo 0 no se cuenta", () => {
    const { fxMissingCount, outstanding } = derivePortalKpis(bookings, [
      { status: "sent", balance: 0, moneda: "USD", tipo_cambio: null },
    ]);
    expect(fxMissingCount).toBe(0);
    expect(outstanding).toBe(0);
  });

  it("saldo dentro de la tolerancia (epsilon) no se cuenta", () => {
    const { fxMissingCount } = derivePortalKpis(bookings, [
      { status: "sent", balance: 0.005, moneda: "USD", tipo_cambio: 1 },
    ]);
    expect(fxMissingCount).toBe(0);
  });

  it("saldo por encima de la tolerancia sí se cuenta", () => {
    const { fxMissingCount } = derivePortalKpis(bookings, [
      { status: "sent", balance: 0.05, moneda: "USD", tipo_cambio: null },
      { status: "sent", balance: 100, moneda: "USD", tipo_cambio: 0 },
    ]);
    expect(fxMissingCount).toBe(2);
  });

  it("MXN nunca se cuenta y divisa con TC válido tampoco", () => {
    const { fxMissingCount, outstanding } = derivePortalKpis(bookings, [
      { status: "sent", balance: 300, moneda: "MXN", tipo_cambio: null },
      { status: "sent", balance: 100, moneda: "USD", tipo_cambio: 18 },
    ]);
    expect(fxMissingCount).toBe(0);
    expect(outstanding).toBe(2100);
  });
});
