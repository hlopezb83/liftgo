import { describe, expect, it } from "vitest";
import { formatQuoteTotal } from "../quoteDisplay";

describe("formatQuoteTotal", () => {
  it.each(["USD", "MXN"])("muestra el importe y una única indicación de %s", (currency) => {
    expect(formatQuoteTotal({ total: 1160, currency })).toBe(`1,160.00 ${currency}`);
  });

  it("normaliza el código y conserva los centavos", () => {
    expect(formatQuoteTotal({ total: 10441.56, currency: " mxn " })).toBe("10,441.56 MXN");
  });

  it.each([null, undefined, ""])("moneda legacy %j conserva MXN explícito", (currency) => {
    expect(formatQuoteTotal({ total: 0, currency })).toBe("0.00 MXN");
  });

  it("un importe inválido no renderiza NaN", () => {
    expect(formatQuoteTotal({ total: Number.NaN, currency: "USD" })).toBe("—");
  });
});
