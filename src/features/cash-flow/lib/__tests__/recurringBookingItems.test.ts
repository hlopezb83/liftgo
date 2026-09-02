import { describe, expect, it } from "vitest";
import { recurringBookingItems, type RecurringBookingRow } from "../cashFlowTransformers";

const base: RecurringBookingRow = {
  id: "b1",
  booking_number: "RES-001",
  customer_name: "ACME",
  start_date: "2026-01-15",
  end_date: "2026-12-31",
  last_billed_date: null,
  monthly_rate: 10000,
  currency: "MXN",
  tipo_cambio: 1,
};

describe("recurringBookingItems (2A-9)", () => {
  it("proyecta periodos mensuales dentro del horizonte", () => {
    const items = recurringBookingItems([base], "2026-01-20", "2026-04-30");
    expect(items.map((i) => i.dueDate)).toEqual(["2026-02-15", "2026-03-15", "2026-04-15"]);
    expect(items.every((i) => i.isProjected && i.kind === "in" && i.amountMxn === 11600)).toBe(true);
  });

  it("arranca después del último periodo facturado", () => {
    const items = recurringBookingItems(
      [{ ...base, last_billed_date: "2026-03-15" }],
      "2026-03-20",
      "2026-05-31",
    );
    expect(items.map((i) => i.dueDate)).toEqual(["2026-04-15", "2026-05-15"]);
  });

  it("no proyecta después del fin de la reserva", () => {
    const items = recurringBookingItems([{ ...base, end_date: "2026-03-01" }], "2026-01-20", "2026-06-30");
    expect(items.map((i) => i.dueDate)).toEqual(["2026-02-15"]);
  });

  it("excluye moneda foránea sin tipo de cambio y rentas sin tarifa mensual", () => {
    expect(recurringBookingItems([{ ...base, currency: "USD", tipo_cambio: 0 }], "2026-01-20", "2026-06-30")).toHaveLength(0);
    expect(recurringBookingItems([{ ...base, monthly_rate: null }], "2026-01-20", "2026-06-30")).toHaveLength(0);
  });

  it("convierte a MXN con el tipo de cambio de la reserva", () => {
    const items = recurringBookingItems(
      [{ ...base, currency: "USD", tipo_cambio: 18 }],
      "2026-01-20",
      "2026-02-28",
    );
    expect(items[0]?.amountMxn).toBe(208800);
  });

  it("FIX-4: respeta una tasa de IVA 0 del cliente", () => {
    const items = recurringBookingItems(
      [{ ...base, customer_tax_rate: 0 }],
      "2026-01-20",
      "2026-02-28",
    );
    expect(items[0]?.amountMxn).toBe(10000);
  });
});
