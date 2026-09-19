import { describe, expect, it } from "vitest";
import * as facade from "../useQuotePrefill";
import * as logic from "../quotePrefill.logic";

/**
 * Contrato del Paquete 6: la fachada `useQuotePrefill.ts` reexporta la API
 * pública previa (funciones y hook) y las funciones puras viven en
 * `quotePrefill.logic.ts` con resultados legacy idénticos.
 */
describe("useQuotePrefill facade", () => {
  it("reexporta las funciones públicas desde el módulo de lógica", () => {
    expect(facade.buildPrefillValues).toBe(logic.buildPrefillValues);
    expect(facade.quoteRentalDays).toBe(logic.quoteRentalDays);
    expect(facade.rentalRateField).toBe(logic.rentalRateField);
    expect(typeof facade.useQuotePrefillValues).toBe("function");
  });

  it("rentalRateField mantiene la prioridad del rate_type explícito (M-10)", () => {
    expect(facade.rentalRateField("Renta mensual", { rate_type: "daily" }, 60)).toBe("dailyRate");
    expect(facade.rentalRateField("Renta mensual", { rate_type: "monthly" }, 5)).toBe("monthlyRate");
  });

  it("rentalRateField conserva las heurísticas legacy", () => {
    expect(facade.rentalRateField("Renta — Renta mensual")).toBe("monthlyRate");
    expect(facade.rentalRateField("Renta semanal")).toBe("weeklyRate");
    // R12-FE-01: cargo único en periodo ≥28 días ⇒ mensual.
    expect(facade.rentalRateField("Renta", { unit_price: 20000, total: 20000 }, 30)).toBe("monthlyRate");
    expect(facade.rentalRateField("Renta", { unit_price: 500, total: 1500 }, 3)).toBe("dailyRate");
  });

  it("quoteRentalDays cuenta fechas inclusivas", () => {
    expect(facade.quoteRentalDays("2026-01-01", "2026-01-01")).toBe(1);
    expect(facade.quoteRentalDays("2026-01-01", "2026-01-31")).toBe(31);
    expect(facade.quoteRentalDays(undefined, "2026-01-31")).toBe(0);
  });

  it("buildPrefillValues conserva partida legacy sin modelo (R9VTA-04)", () => {
    const values = facade.buildPrefillValues(
      {
        quote_type: "rental",
        customer_id: "c1",
        tax_rate: 16,
        start_date: "2026-01-01",
        end_date: "2026-01-30",
        line_items: [
          { description: "Renta montacargas — Renta mensual", qty: 2, unit_price: 20000, total: 40000 },
        ],
      },
      [],
    );
    expect(values.rentalLines).toHaveLength(1);
    const line = values.rentalLines[0];
    expect(line.modelId).toBe("");
    expect(line.quantity).toBe(2);
    expect(line.monthlyRate).toBe(20000);
    expect(line.dailyRate).toBe(0);
    expect(line.legacyTotal).toBe(20000);
    expect(line.legacyDescription).toBe("Renta montacargas — Renta mensual");
  });
});
