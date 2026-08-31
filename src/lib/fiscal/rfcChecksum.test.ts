import { describe, expect, it } from "vitest";
import { hasValidRfcChecksum } from "./rfcChecksum";

describe("hasValidRfcChecksum", () => {
  it("acepta los RFC genéricos del SAT", () => {
    expect(hasValidRfcChecksum("XAXX010101000")).toBe(true);
    expect(hasValidRfcChecksum("XEXX010101000")).toBe(true);
  });

  it("rechaza longitudes fuera de 12/13", () => {
    expect(hasValidRfcChecksum("AAA010101")).toBe(false);
    expect(hasValidRfcChecksum("AAAA0101010001")).toBe(false);
  });

  it("es determinista: sólo un dígito verificador es válido por RFC", () => {
    const base = "AAAA010101AA";
    const valid = "0123456789A".split("").filter((d) => hasValidRfcChecksum(base + d));
    expect(valid).toHaveLength(1);
  });

  it("mapea correctamente los casos borde del módulo 11 (A y 1)", () => {
    // Implementación de referencia independiente: dígito = 11 - (sum % 11),
    // donde 11 -> "0" y 10 -> "A" (algoritmo SAT).
    const DICT = "0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ";
    const refDigit = (body12: string): string => {
      // body12 = primeros 12 caracteres de un RFC de 13 (persona física).
      let sum = 0;
      for (let i = 0; i < 12; i++) sum += DICT.indexOf(body12[i]) * (13 - i);
      const v = 11 - (sum % 11);
      return v === 11 ? "0" : v === 10 ? "A" : String(v);
    };
    // Barre cuerpos reales de 13 caracteres y valida que hasValidRfcChecksum
    // acepta exactamente el dígito de referencia en cada caso.
    const seen = new Set<string>();
    for (const tail of ["00", "01", "0A", "1A", "A0", "ZZ", "99", "B7"]) {
      for (const mid of ["010101", "120599", "300287"]) {
        for (const prefix of ["AAA", "GOB", "MEL", "XAA"]) {
          const body = `${prefix}${mid}${tail}`;
          const digit = refDigit(body);
          const r = body + digit;
          seen.add(digit);
          expect(hasValidRfcChecksum(r)).toBe(true);
          if (digit !== "0") {
            const wrong = body + (digit === "A" ? "1" : "A");
            expect(hasValidRfcChecksum(wrong)).toBe(false);
          }
        }
      }
    }
    // Asegura que el barrido cubrió los casos borde 11->"0" y 10->"A".
    expect(seen.has("0")).toBe(true);
    expect(seen.has("A")).toBe(true);
    expect(seen.has("1")).toBe(true);
  });

  it("normaliza minúsculas y espacios", () => {
    const base = "AAAA010101AA";
    const digit = "0123456789A".split("").find((d) => hasValidRfcChecksum(base + d))!;
    expect(hasValidRfcChecksum(` ${base.toLowerCase()}${digit.toLowerCase()} `)).toBe(true);
  });
});
