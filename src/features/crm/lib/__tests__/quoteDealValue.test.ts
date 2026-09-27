import { describe, expect, it } from "vitest";
import { quoteDealValueMxn } from "../quoteDealValue";

describe("quoteDealValueMxn", () => {
  it("convierte el total USD pactado con el TC del documento", () => {
    expect(quoteDealValueMxn({ total: 1160, currency: "USD", tipo_cambio: 18.25 }))
      .toEqual({ value: 21170, error: null });
  });

  it("redondea el importe final, sin redondear primero el tipo de cambio", () => {
    expect(quoteDealValueMxn({ total: 3.33, currency: "USD", tipo_cambio: 18.2573 }).value).toBe(60.80);
  });

  it.each([null, undefined, 0, 1, -1, Number.NaN, Infinity, ""])(
    "rechaza TC extranjero inválido %s en lugar de tratar USD como MXN", (rate) => {
      const result = quoteDealValueMxn({ total: 1160, currency: "USD", tipo_cambio: rate });
      expect(result.value).toBeNull();
      expect(result.error).toMatch(/tipo de cambio válido/);
    },
  );

  it.each(["MXN", null, undefined])("no multiplica moneda local/legacy %s", (code) => {
    expect(quoteDealValueMxn({ total: 120.08, currency: code, tipo_cambio: 18.25 }))
      .toEqual({ value: 120.08, error: null });
  });

  it.each([Number.NaN, Infinity, -1])("rechaza total inválido %s", (total) => {
    expect(quoteDealValueMxn({ total, currency: "MXN" }).value).toBeNull();
  });
});
