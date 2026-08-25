import { describe, expect, it } from "vitest";
import { computeMaxCreditable } from "../computeMaxCreditable";

describe("computeMaxCreditable (BL-08 v7.90.0 + H-5 v7.334.0)", () => {
  it("factura sin créditos → max = total", () => {
    expect(computeMaxCreditable(1000, 0, 0)).toBe(1000);
  });

  it("PUE: factura pagada sin REP no reduce el tope", () => {
    // Los pagos sin complemento vigente no topan: la NC genera saldo a favor.
    expect(computeMaxCreditable(1000, 0, 0, 0)).toBe(1000);
  });

  it("con NC activa → resta acreditado", () => {
    expect(computeMaxCreditable(1000, 300, 0)).toBe(700);
  });

  it("con borrador de NC → resta borradores también", () => {
    expect(computeMaxCreditable(1000, 200, 150)).toBe(650);
  });

  it("valores no numéricos coerción segura", () => {
    expect(computeMaxCreditable(Number("abc"), 0, 0)).toBe(0);
  });

  it("B-7: total exactamente cubierto por NC devuelve 0 sin drift IEEE-754", () => {
    expect(computeMaxCreditable(10.21, 5.11, 5.10)).toBe(0);
  });

  it("B-7: redondea a 2 decimales monetarios", () => {
    expect(computeMaxCreditable(100.005, 0.001, 0)).toBe(100);
  });

  it("H-5: PPD con REP vigente parcial → tope = total − REP", () => {
    expect(computeMaxCreditable(1000, 0, 0, 400)).toBe(600);
  });

  it("H-5: REP vigente por el total → tope 0 (hay que cancelar el REP)", () => {
    expect(computeMaxCreditable(1000, 0, 0, 1000)).toBe(0);
  });

  it("H-5: REP + NC previas se acumulan", () => {
    expect(computeMaxCreditable(1000, 200, 100, 400)).toBe(300);
  });

  it("H-5: nunca devuelve negativo", () => {
    expect(computeMaxCreditable(1000, 800, 0, 500)).toBe(0);
  });
});
