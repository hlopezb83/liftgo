import { describe, expect, it } from "vitest";
import { firstBillingPeriod, prorateMonthlyAmount } from "../firstBillingPeriod";

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

describe("prorateMonthlyAmount", () => {
  it("prorratea por días con redondeo a centavos", () => {
    expect(prorateMonthlyAmount(10_000, 17, 31)).toBe(5_483.87);
    expect(prorateMonthlyAmount(30_000, 19, 30)).toBe(19_000);
  });

  it("mes completo devuelve la tarifa íntegra", () => {
    expect(prorateMonthlyAmount(10_000, 31, 31)).toBe(10_000);
  });

  it("tarifa 0 o días inválidos devuelven 0", () => {
    expect(prorateMonthlyAmount(0, 17, 31)).toBe(0);
    expect(prorateMonthlyAmount(10_000, 0, 31)).toBe(0);
  });
});
