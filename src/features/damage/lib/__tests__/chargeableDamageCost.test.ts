import { describe, expect, it } from "vitest";
import type { DamageRecordWithJoins } from "@/types/rental";
import { chargeableDamageCost } from "../chargeableDamageCost";

type R = Pick<DamageRecordWithJoins, "status" | "estimated_cost" | "actual_cost">;
const r = (o: Partial<R>): R => ({ status: "reported", estimated_cost: null, actual_cost: null, ...o });

describe("chargeableDamageCost (Fix A v7.90.0)", () => {
  it("un cero histórico sin valoración no permite sugerir un cobro gratis", () => {
    expect(chargeableDamageCost(r({ status: "repaired", estimated_cost: 650, actual_cost: 0 }))).toBeNull();
  });
  it.each(["manual", "maintenance"])("un cero registrado por %s es una valoración válida", (source) => {
    expect(chargeableDamageCost({ ...r({ status: "repaired", estimated_cost: 650, actual_cost: 0 }), actual_cost_source: source })).toBe(0);
  });
  it("repaired con actual_cost → costo real", () => {
    expect(chargeableDamageCost(r({ status: "repaired", estimated_cost: 500, actual_cost: 750 }))).toBe(750);
  });
  it("repaired sin actual_cost → el presupuesto no sustituye una valoración real", () => {
    expect(chargeableDamageCost(r({ status: "repaired", estimated_cost: 500 }))).toBeNull();
  });
  it("reported → no permite cobrar antes de reparar", () => {
    expect(chargeableDamageCost(r({ status: "reported", estimated_cost: 300 }))).toBeNull();
  });
  it("sin ambos costos → null", () => {
    expect(chargeableDamageCost(r({ status: "repaired" }))).toBeNull();
    expect(chargeableDamageCost(r({ status: "reported" }))).toBeNull();
  });
  it("otros estados → null", () => {
    expect(chargeableDamageCost(r({ status: "invoiced", actual_cost: 900 }))).toBeNull();
  });
});
