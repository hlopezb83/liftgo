import { describe, it, expect } from "vitest";
import { isQuotePastValidity } from "../quoteStatus";

/**
 * M2-08: vigencia de cotización comparada contra la medianoche de Monterrey
 * (nowMty()), no contra la medianoche local del navegador del cliente.
 */
describe("isQuotePastValidity", () => {
  it("sin valid_until → nunca vencida", () => {
    expect(isQuotePastValidity(null, new Date(2024, 0, 15))).toBe(false);
  });

  it("valid_until = hoy (Monterrey) → NO vencida (se puede aceptar el mismo día)", () => {
    const today = new Date(2024, 0, 15, 23, 0, 0);
    const validUntil = new Date(2024, 0, 15);
    expect(isQuotePastValidity(validUntil, today)).toBe(false);
  });

  it("valid_until = ayer (Monterrey) → vencida", () => {
    const today = new Date(2024, 0, 15, 1, 0, 0);
    const validUntil = new Date(2024, 0, 14);
    expect(isQuotePastValidity(validUntil, today)).toBe(true);
  });

  it("valid_until = mañana → no vencida", () => {
    const today = new Date(2024, 0, 15);
    const validUntil = new Date(2024, 0, 16);
    expect(isQuotePastValidity(validUntil, today)).toBe(false);
  });
});
