import { describe, expect, it } from "vitest";
import { nowMty } from "@/lib/utils";
import { createPickupSchema } from "../../../lib/postDeliveryPickupForm";

describe("BL-42 · Recolección: horómetro ≥ horas de entrega", () => {
  it("acepta null cuando aún no se ha capturado", () => {
    const schema = createPickupSchema(1500);
    expect(schema.safeParse({ scheduledDate: nowMty(), hoursReading: null }).success).toBe(true);
  });

  it("rechaza horas menores a la entrega", () => {
    const schema = createPickupSchema(1500);
    const result = schema.safeParse({ scheduledDate: nowMty(), hoursReading: 1499.9 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("1500");
    }
  });

  it("acepta horas iguales o mayores a la entrega", () => {
    const schema = createPickupSchema(1500);
    expect(schema.safeParse({ scheduledDate: nowMty(), hoursReading: 1500 }).success).toBe(true);
    expect(schema.safeParse({ scheduledDate: nowMty(), hoursReading: 1750.5 }).success).toBe(true);
  });

  it("sin baseline (delivery sin horómetro) sólo valida no-negativos", () => {
    const schema = createPickupSchema(null);
    expect(schema.safeParse({ scheduledDate: nowMty(), hoursReading: 0 }).success).toBe(true);
    expect(schema.safeParse({ scheduledDate: nowMty(), hoursReading: 999999 }).success).toBe(true);
    expect(schema.safeParse({ scheduledDate: nowMty(), hoursReading: -1 }).success).toBe(false);
  });
});
