import { describe, expect, it } from "vitest";
import { resolveBillingPeriod } from "../useInvoiceFormSubmit";

describe("resolveBillingPeriod", () => {
  const issue = new Date(2026, 7, 15); // 15-ago-2026

  it("respeta el periodo capturado por el usuario", () => {
    expect(resolveBillingPeriod("2026-07-01", "2026-07-31", issue)).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
    });
  });

  it("deriva el mes de emisión cuando falta el periodo completo", () => {
    expect(resolveBillingPeriod(null, null, issue)).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    });
  });

  it("completa solo el extremo faltante", () => {
    expect(resolveBillingPeriod("2026-08-10", "", issue)).toEqual({
      start: "2026-08-10",
      end: "2026-08-31",
    });
  });

  it("nunca devuelve nulos", () => {
    const r = resolveBillingPeriod(undefined, undefined, undefined);
    expect(r.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
