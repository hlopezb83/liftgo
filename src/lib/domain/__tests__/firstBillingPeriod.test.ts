import { describe, expect, it } from "vitest";
import { firstBillingPeriod, prorateMonthlyLine } from "../firstBillingPeriod";

describe("firstBillingPeriod", () => {
  it("recorta al fin de mes cuando la reserva dura más de un mes", () => {
    const p = firstBillingPeriod("2026-09-12", "2027-09-11");
    expect(p).toMatchObject({
      start: "2026-09-12",
      end: "2026-09-30",
      billedDays: 19,
      daysInMonth: 30,
      isProrated: true,
      truncated: true,
    });
  });

  it("no prorratea cuando la reserva arranca el día 1", () => {
    const p = firstBillingPeriod("2026-09-01", "2027-08-31");
    expect(p).toMatchObject({ end: "2026-09-30", isProrated: false, truncated: true });
  });

  it("no recorta rentas que terminan dentro del mismo mes", () => {
    const p = firstBillingPeriod("2026-09-05", "2026-09-20");
    expect(p).toMatchObject({ end: "2026-09-20", truncated: false, billedDays: 16 });
  });

  it("devuelve null con fecha inválida", () => {
    expect(firstBillingPeriod(null, "2026-09-20")).toBeNull();
  });
});

describe("prorateMonthlyLine", () => {
  it("cobra los días restantes al precio diario derivado de la mensual", () => {
    expect(prorateMonthlyLine(30_000, 19, 30)).toEqual({
      quantity: 19,
      unitPrice: 1_000,
      total: 19_000,
    });
  });

  it("mes de 31 días: precio diario con decimales y total a centavos", () => {
    const line = prorateMonthlyLine(10_000, 17, 31);
    expect(line).toEqual({ quantity: 17, unitPrice: 322.580645, total: 5_483.87 });
  });

  it("febrero de 28 días", () => {
    const line = prorateMonthlyLine(28_000, 10, 28);
    expect(line).toEqual({ quantity: 10, unitPrice: 1_000, total: 10_000 });
  });

  it("tarifa 0 o días inválidos devuelven null", () => {
    expect(prorateMonthlyLine(0, 17, 31)).toBeNull();
    expect(prorateMonthlyLine(10_000, 0, 31)).toBeNull();
  });
});
