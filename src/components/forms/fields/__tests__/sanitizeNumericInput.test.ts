import { describe, it, expect } from "vitest";
import { sanitizeNumericInput } from "../sanitizeNumericInput";

/**
 * Fix BLOCKING (review): en locale es-MX la coma es separador de MILES y el
 * punto es el separador decimal. La versión anterior trataba la primera coma
 * como decimal, así que pegar el display en reposo ("1,234.50") lo corrompía
 * a "1.23" (~1000× menos) y zod positiveAmount() lo aceptaba en silencio.
 */
describe("CurrencyField sanitizeNumericInput (es-MX: ',' = miles, '.' = decimal)", () => {
  it("coma + punto: las comas son miles y se eliminan", () => {
    expect(sanitizeNumericInput("1,234.50")).toBe("1234.50");
  });

  it("una coma seguida de exactamente 3 dígitos: es miles", () => {
    expect(sanitizeNumericInput("1,234")).toBe("1234");
  });

  it("punto decimal sin comas: se conserva intacto", () => {
    expect(sanitizeNumericInput("12.50")).toBe("12.50");
  });

  it("una coma con 1 dígito decimal: es decimal", () => {
    expect(sanitizeNumericInput("0,5")).toBe("0.5");
  });

  it("una coma con 2 dígitos decimales: es decimal", () => {
    expect(sanitizeNumericInput("12,34")).toBe("12.34");
  });

  it("varias comas + punto: todas las comas son miles", () => {
    expect(sanitizeNumericInput("1,234,567.89")).toBe("1234567.89");
  });

  it("entero plano sin separadores: pasa tal cual", () => {
    expect(sanitizeNumericInput("1234")).toBe("1234");
  });
});
