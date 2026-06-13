import { describe, it, expect } from "vitest";
import { forkliftFormSchema } from "../forkliftFormSchema";

describe("forkliftFormSchema", () => {
  it("acepta payload mínimo válido", () => {
    const r = forkliftFormSchema.safeParse({ name: "MX-001", model: "H30FT" });
    expect(r.success).toBe(true);
  });

  it("rechaza nombre vacío", () => {
    const r = forkliftFormSchema.safeParse({ name: "", model: "X" });
    expect(r.success).toBe(false);
  });

  it("rechaza modelo vacío", () => {
    const r = forkliftFormSchema.safeParse({ name: "X", model: "" });
    expect(r.success).toBe(false);
  });

  it("aplica defaults: fuel_type=Diesel, status=available", () => {
    const r = forkliftFormSchema.parse({ name: "X", model: "Y" });
    expect(r.fuel_type).toBe("Diesel");
    expect(r.status).toBe("available");
    expect(r.daily_rate).toBe("");
    expect(r.insurance_provider).toBe("");
  });

  it("preserva valores no-default cuando se proveen", () => {
    const r = forkliftFormSchema.parse({
      name: "MX-100",
      model: "H50",
      fuel_type: "Gas LP",
      daily_rate: "1500",
      capacity_kg: "5000",
    });
    expect(r.fuel_type).toBe("Gas LP");
    expect(r.daily_rate).toBe("1500");
    expect(r.capacity_kg).toBe("5000");
  });
});
