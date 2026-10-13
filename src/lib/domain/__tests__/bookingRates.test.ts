import { describe, expect, it } from "vitest";
import { resolveBookingRates } from "../bookingRates";
import { calculateRentalCost } from "../rentalCalculation";

describe("resolveBookingRates", () => {
  it("no mezcla la tarifa diaria del catálogo con una mensual pactada (RSV-0047)", () => {
    const r = resolveBookingRates(
      { daily_rate: 2500, weekly_rate: 0, monthly_rate: 20000 },
      { daily_rate: null, weekly_rate: null, monthly_rate: 15000 },
    );
    expect(r).toEqual({ daily: 0, weekly: 0, monthly: 15000 });
    const items = calculateRentalCost(r.daily, r.weekly, r.monthly, new Date(2026, 6, 17), new Date(2026, 9, 31));
    const daily = items.find((i) => i.rate_type === "daily");
    expect(daily?.unit_price).toBe(500);
  });

  it("sin tarifas pactadas usa el catálogo", () => {
    expect(resolveBookingRates({ daily_rate: 2500, weekly_rate: 0, monthly_rate: 20000 }, { daily_rate: 0 }))
      .toEqual({ daily: 2500, weekly: 0, monthly: 20000 });
  });
});
