import { describe, expect, it } from "vitest";
import { allowsRecurringBilling } from "../recurringBillingEligibility";

const day = (value: string) => new Date(`${value}T00:00:00`);

describe("allowsRecurringBilling · fin inclusivo y mes calendario", () => {
  it.each([
    ["2026-10-01", "2026-10-30", false],
    ["2026-10-01", "2026-10-31", true],
    ["2026-10-01", "2026-11-01", true],
    ["2026-11-01", "2026-11-30", true],
    ["2027-02-01", "2027-02-27", false],
    ["2027-02-01", "2027-02-28", true],
    ["2028-02-01", "2028-02-28", false],
    ["2028-02-01", "2028-02-29", true],
    ["2027-01-31", "2027-02-26", false],
    ["2027-01-31", "2027-02-27", true],
    ["2028-01-31", "2028-02-27", false],
    ["2028-01-31", "2028-02-28", true],
    ["2026-12-31", "2027-01-30", true],
    ["2026-09-26", "2026-09-26", false],
  ])("%s → %s: %s", (start, end, expected) => {
    expect(allowsRecurringBilling(day(start), day(end))).toBe(expected);
  });

  it("no habilita recurrencia para fechas faltantes, inválidas o invertidas", () => {
    expect(allowsRecurringBilling(undefined, day("2026-10-31"))).toBe(false);
    expect(allowsRecurringBilling(day("2026-10-01"), undefined)).toBe(false);
    expect(allowsRecurringBilling(new Date("invalid"), day("2026-10-31"))).toBe(false);
    expect(allowsRecurringBilling(day("2026-10-31"), day("2026-10-01"))).toBe(false);
  });
});
