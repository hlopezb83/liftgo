import { describe, it, expect } from "vitest";
import { buildPrefillValues, type EquipmentModel, type ExistingQuote } from "../useQuotePrefill";

const models: EquipmentModel[] = [];

const base: ExistingQuote = {
  id: "q-legacy",
  quote_type: "rental",
  customer_id: "c-1",
  customer_name: "Cliente Legacy",
  start_date: "2026-01-01",
  end_date: "2026-01-31",
  tax_rate: 16,
  currency: "MXN",
  rental_meta: undefined,
};

describe("R10-FE-03 · prefill de partidas legacy", () => {
  it("lee `qty` cuando la partida legacy no trae `quantity`", () => {
    const v = buildPrefillValues(
      { ...base, line_items: [{ description: "Renta montacargas", qty: 4, unit_price: 800, total: 99200 }] },
      models,
    );
    expect(v.rentalLines[0].quantity).toBe(4);
    expect(v.rentalLines[0].dailyRate).toBe(800);
  });

  it("no sintetiza la tarifa diaria desde `total` (evita totales fantasma)", () => {
    const v = buildPrefillValues(
      { ...base, line_items: [{ description: "Renta montacargas", qty: 2, total: 434000 }] },
      models,
    );
    expect(v.rentalLines[0].dailyRate).toBe(0);
    expect(v.rentalLines[0].quantity).toBe(2);
  });

  it("mantiene `quantity` cuando la partida es moderna", () => {
    const v = buildPrefillValues(
      { ...base, line_items: [{ description: "Renta montacargas", quantity: 3, unit_price: 500, total: 1500 }] },
      models,
    );
    expect(v.rentalLines[0].quantity).toBe(3);
    expect(v.rentalLines[0].dailyRate).toBe(500);
  });
});
