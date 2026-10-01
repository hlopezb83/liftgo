import { describe, expect, it } from "vitest";
import { hasRecordedActualCost } from "../actualDamageCost";

describe("valoración real de daños", () => {
  it("un cero sin procedencia no representa una reparación gratuita", () => {
    expect(hasRecordedActualCost({ actual_cost: 0, actual_cost_source: null })).toBe(false);
  });
  it("una valoración manual o desde la OT puede registrar costo cero", () => {
    expect(hasRecordedActualCost({ actual_cost: 0, actual_cost_source: "manual" })).toBe(true);
    expect(hasRecordedActualCost({ actual_cost: 0, actual_cost_source: "maintenance" })).toBe(true);
  });
  it("preserva un costo positivo histórico sin obligar a revalorarlo", () => {
    expect(hasRecordedActualCost({ actual_cost: 650, actual_cost_source: null })).toBe(true);
  });
  it("no usa importes ausentes, negativos o no finitos para valorar una reparación", () => {
    for (const actual_cost of [null, -1, NaN, Infinity]) {
      expect(hasRecordedActualCost({ actual_cost, actual_cost_source: "manual" })).toBe(false);
    }
  });
});
