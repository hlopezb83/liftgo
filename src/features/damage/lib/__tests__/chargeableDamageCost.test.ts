import { describe, expect, it } from "vitest";
import type { DamageRecordWithJoins } from "@/types/rental";
import { chargeableDamageCost } from "../chargeableDamageCost";

type R = Pick<DamageRecordWithJoins, "status" | "estimated_cost" | "actual_cost">;
const r = (o: Partial<R>): R => ({ status: "reported", estimated_cost: null, actual_cost: null, ...o });

describe("chargeableDamageCost (Fix A v7.90.0)", () => {
  it("repaired con actual_cost → costo real", () => {
    expect(chargeableDamageCost(r({ status: "repaired", estimated_cost: 500, actual_cost: 750 }))).toBe(750);
  });
  it("repaired sin actual_cost → cae al estimado", () => {
    expect(chargeableDamageCost(r({ status: "repaired", estimated_cost: 500 }))).toBe(500);
  });
  it("reported → cobra el estimado", () => {
    expect(chargeableDamageCost(r({ status: "reported", estimated_cost: 300 }))).toBe(300);
  });
  it("sin ambos costos → null", () => {
    expect(chargeableDamageCost(r({ status: "repaired" }))).toBeNull();
    expect(chargeableDamageCost(r({ status: "reported" }))).toBeNull();
  });
  it("otros estados → null", () => {
    expect(chargeableDamageCost(r({ status: "invoiced", actual_cost: 900 }))).toBeNull();
  });
});
