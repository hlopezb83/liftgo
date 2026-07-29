import { describe, it, expect } from "vitest";
import { averageRentPerUnit } from "../mrrKpis";

describe("averageRentPerUnit", () => {
  it("devuelve 0 cuando no hay unidades rentadas", () => {
    expect(averageRentPerUnit(396000, 0)).toBe(0);
  });

  it("devuelve 0 con conteo negativo (defensivo)", () => {
    expect(averageRentPerUnit(396000, -3)).toBe(0);
  });

  it("divide el MRR entre las unidades rentadas", () => {
    expect(averageRentPerUnit(396000, 16)).toBe(24750);
  });

  it("no agrupa por cliente", () => {
    // 3 reservas del mismo cliente => promedio por unidad, no por cliente
    expect(averageRentPerUnit(60000, 3)).toBe(20000);
  });
});
