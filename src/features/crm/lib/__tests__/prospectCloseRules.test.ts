import { describe, it, expect } from "vitest";
import { canCloseAsWon, wonBlockedReason, wonBlockedReasonFull, isValidFinalAmount } from "../prospectCloseRules";

describe("prospectCloseRules (V3-2 / DB3-16)", () => {
  it("solo permite cerrar como ganado desde negociación", () => {
    expect(canCloseAsWon("negociacion", true)).toBe(true);
    expect(canCloseAsWon("contactado", true)).toBe(false);
    expect(canCloseAsWon("nuevo_prospecto", true)).toBe(false);
  });

  it("respeta el permiso del usuario aunque la etapa sea válida", () => {
    expect(canCloseAsWon("negociacion", false)).toBe(false);
  });

  it("explica por qué está bloqueado fuera de negociación", () => {
    expect(wonBlockedReason("negociacion")).toBeUndefined();
    expect(wonBlockedReason("cotizacion_enviada")).toMatch(/Negociación/);
  });

  it("N4-02: explica el bloqueo por rol aunque la etapa sea válida", () => {
    expect(wonBlockedReasonFull("negociacion", false)).toMatch(/administrador o administrativo/);
    expect(wonBlockedReasonFull("negociacion", true)).toBeUndefined();
    expect(wonBlockedReasonFull("cotizacion_enviada", false)).toMatch(/Negociación/);
  });

  it("exige monto final mayor a cero", () => {
    expect(isValidFinalAmount(1)).toBe(true);
    expect(isValidFinalAmount(0)).toBe(false);
    expect(isValidFinalAmount(-5)).toBe(false);
    expect(isValidFinalAmount(null)).toBe(false);
    expect(isValidFinalAmount(undefined)).toBe(false);
  });
});
