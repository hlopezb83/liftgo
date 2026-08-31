import { describe, it, expect } from "vitest";
import { parseDateFlexible } from "../bankParseUtils";

/**
 * 2A-6: `parseDateFlexible` aceptaba fechas imposibles como 31/02/2026 porque
 * confiaba en el regex sin validar el calendario real. Ahora hace round-trip
 * contra un `Date` real y regresa null si el día/mes/año no cuadran.
 */
describe("parseDateFlexible · validación de calendario real (2A-6)", () => {
  it("acepta fechas válidas DD/MM/YYYY", () => {
    expect(parseDateFlexible("28/02/2026")).toBe("2026-02-28");
    expect(parseDateFlexible("31/01/2026")).toBe("2026-01-31");
  });

  it("rechaza 31 de febrero", () => {
    expect(parseDateFlexible("31/02/2026")).toBeNull();
  });

  it("rechaza 30 de febrero (incluso en año bisiesto)", () => {
    expect(parseDateFlexible("30/02/2024")).toBeNull();
  });

  it("rechaza 31 de abril (mes de 30 días)", () => {
    expect(parseDateFlexible("31/04/2026")).toBeNull();
  });

  it("acepta 29 de febrero en año bisiesto", () => {
    expect(parseDateFlexible("29/02/2024")).toBe("2024-02-29");
  });

  it("rechaza 29 de febrero en año no bisiesto", () => {
    expect(parseDateFlexible("29/02/2026")).toBeNull();
  });

  it("rechaza fechas imposibles en formato ISO", () => {
    expect(parseDateFlexible("2026-02-31")).toBeNull();
  });

  it("rechaza fechas imposibles en formato DD/MM/YY", () => {
    expect(parseDateFlexible("31/02/26")).toBeNull();
  });

  it("rechaza fechas imposibles en formato DDMMMYYYY", () => {
    expect(parseDateFlexible("31FEB2026")).toBeNull();
  });

  it("sigue aceptando formatos válidos previamente soportados", () => {
    expect(parseDateFlexible("2026-07-01")).toBe("2026-07-01");
    expect(parseDateFlexible("01JUL2026")).toBe("2026-07-01");
    expect(parseDateFlexible("01/07/26")).toBe("2026-07-01");
  });
});
