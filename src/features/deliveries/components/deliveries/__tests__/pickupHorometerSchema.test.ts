import { describe, expect, it } from "vitest";
import { z } from "zod";

// Replica de la fábrica usada en PostDeliveryPickupDialog para permitir
// validar la regla BL-42 sin montar el diálogo completo.
const makeSchema = (minHours: number | null) =>
  z.object({
    hoursReading: z.number().min(0).nullable().default(null).refine(
      (v) => v === null || minHours === null || v >= minHours,
      {
        message: minHours !== null
          ? `El horómetro no puede ser menor a ${minHours} hrs (registradas en la entrega).`
          : "Horómetro inválido",
      },
    ),
  });

describe("BL-42 · Recolección: horómetro ≥ horas de entrega", () => {
  it("acepta null cuando aún no se ha capturado", () => {
    const schema = makeSchema(1500);
    expect(schema.safeParse({ hoursReading: null }).success).toBe(true);
  });

  it("rechaza horas menores a la entrega", () => {
    const schema = makeSchema(1500);
    const result = schema.safeParse({ hoursReading: 1499.9 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("1500");
    }
  });

  it("acepta horas iguales o mayores a la entrega", () => {
    const schema = makeSchema(1500);
    expect(schema.safeParse({ hoursReading: 1500 }).success).toBe(true);
    expect(schema.safeParse({ hoursReading: 1750.5 }).success).toBe(true);
  });

  it("sin baseline (delivery sin horómetro) sólo valida no-negativos", () => {
    const schema = makeSchema(null);
    expect(schema.safeParse({ hoursReading: 0 }).success).toBe(true);
    expect(schema.safeParse({ hoursReading: 999999 }).success).toBe(true);
    expect(schema.safeParse({ hoursReading: -1 }).success).toBe(false);
  });
});
