import { describe, expect, it } from "vitest";
import { shouldShowActualCost } from "../showActualCost";

describe("shouldShowActualCost (F6)", () => {
  it("muestra $0 en daños cerrados (reparado/facturado)", () => {
    expect(shouldShowActualCost(0, "repaired")).toBe(true);
    expect(shouldShowActualCost(0, "invoiced")).toBe(true);
  });

  it("oculta $0 mientras el daño sigue abierto", () => {
    expect(shouldShowActualCost(0, "reported")).toBe(false);
    expect(shouldShowActualCost(0, "in_repair")).toBe(false);
  });

  it("muestra siempre un costo mayor a cero", () => {
    expect(shouldShowActualCost(1500, "reported")).toBe(true);
  });

  it("oculta cuando no hay costo capturado", () => {
    expect(shouldShowActualCost(null, "repaired")).toBe(false);
    expect(shouldShowActualCost(undefined, "invoiced")).toBe(false);
  });
});
