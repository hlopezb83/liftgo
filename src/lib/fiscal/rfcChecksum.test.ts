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

  it("normaliza minúsculas y espacios", () => {
    const base = "AAAA010101AA";
    const digit = "0123456789A".split("").find((d) => hasValidRfcChecksum(base + d))!;
    expect(hasValidRfcChecksum(` ${base.toLowerCase()}${digit.toLowerCase()} `)).toBe(true);
  });
});
