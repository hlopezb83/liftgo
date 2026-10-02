import { describe, expect, it } from "vitest";
import { formatRecurringFailure } from "../formatRecurringFailure";

describe("formatRecurringFailure", () => {
  it("conserva textos normales", () => {
    expect(formatRecurringFailure("Falta uso CFDI")).toBe("Falta uso CFDI");
  });
  it("no muestra [object Object]", () => {
    expect(formatRecurringFailure("[object Object]")).toBe("Error sin detalle");
  });
  it("extrae mensaje, detalle y código de objetos", () => {
    expect(
      formatRecurringFailure({ message: { message: "Sin cotización" }, details: "x", code: "P0001" }),
    ).toBe("Sin cotización · x · (código P0001)");
  });
  it("serializa objetos sin mensaje", () => {
    expect(formatRecurringFailure({ foo: 1 })).toBe('{"foo":1}');
  });
});
