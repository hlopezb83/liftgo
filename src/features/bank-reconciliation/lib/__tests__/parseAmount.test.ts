import { describe, it, expect } from "vitest";
import { parseAmount } from "../bankParseUtils";

/**
 * R23-E: los estados de cuenta mexicanos pueden traer coma decimal
 * ("1.500,50"). El parser viejo borraba todas las comas y leía 1.5005,
 * corrompiendo el importe por un factor de 1000.
 */
describe("parseAmount", () => {
  it("lee formato en-US con separador de miles", () => {
    expect(parseAmount("$1,234.56")).toBe(1234.56);
    expect(parseAmount("1,234,567.89")).toBe(1234567.89);
  });

  it("lee formato es-MX con coma decimal", () => {
    expect(parseAmount("1.500,50")).toBe(1500.5);
    expect(parseAmount("$1.234.567,89")).toBe(1234567.89);
    expect(parseAmount("0,75")).toBe(0.75);
  });

  it("trata paréntesis y signo menos como negativos", () => {
    expect(parseAmount("(1,234.56)")).toBe(-1234.56);
    expect(parseAmount("-1.500,50")).toBe(-1500.5);
  });

  it("ignora espacios normales y NBSP", () => {
    expect(parseAmount("$ 1 234.56")).toBe(1234.56);
    expect(parseAmount("1\u00A0234,56")).toBe(1234.56);
  });

  it("devuelve null para vacío o no numérico", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("N/A")).toBeNull();
  });

  it("no altera enteros sin separadores", () => {
    expect(parseAmount("1500")).toBe(1500);
  });
});
