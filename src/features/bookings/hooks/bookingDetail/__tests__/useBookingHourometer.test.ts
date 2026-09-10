import { describe, expect, it } from "vitest";
import { computeHourometer, pickLatestReading } from "../useBookingHourometer";

const row = (o: Partial<Parameters<typeof pickLatestReading>[0] extends (infer T)[] | undefined ? T : never>) => ({
  type: "delivery",
  hours_reading: 0,
  status: "completed",
  ...o,
});

describe("Bloque 3A · horómetro", () => {
  it("usa la ÚLTIMA lectura completada, no la primera de la lista", () => {
    const rows = [
      row({ type: "delivery", hours_reading: 100, completed_at: "2026-01-01T10:00:00Z" }),
      row({ type: "delivery", hours_reading: 120, completed_at: "2026-02-01T10:00:00Z" }),
      row({ type: "pickup", hours_reading: 200, completed_at: "2026-03-01T10:00:00Z" }),
    ];
    expect(computeHourometer(rows)).toEqual({
      deliveryHours: 120,
      pickupHours: 200,
      hoursUsed: 80,
    });
  });

  it("ignora lecturas no completadas o sin valor", () => {
    const rows = [
      row({ type: "delivery", hours_reading: 999, status: "scheduled", completed_at: "2026-05-01T00:00:00Z" }),
      row({ type: "delivery", hours_reading: 50, completed_at: "2026-01-01T00:00:00Z" }),
      row({ type: "pickup", hours_reading: null, status: "completed" }),
    ];
    const result = computeHourometer(rows);
    expect(result.deliveryHours).toBe(50);
    expect(result.pickupHours).toBeNull();
    expect(result.hoursUsed).toBeNull();
  });

  it("ordena de forma determinista con lecturas fuera de orden y sin completed_at", () => {
    const rows = [
      row({ type: "delivery", hours_reading: 10, completed_at: null, scheduled_date: "2026-01-05", created_at: "2026-01-05T00:00:00Z" }),
      row({ type: "delivery", hours_reading: 30, completed_at: null, scheduled_date: "2026-01-09", created_at: "2026-01-01T00:00:00Z" }),
      row({ type: "pickup", hours_reading: 45, completed_at: null, scheduled_date: "2026-02-01" }),
    ];
    expect(computeHourometer(rows)).toEqual({
      deliveryHours: 30,
      pickupHours: 45,
      hoursUsed: 15,
    });
  });

  it("no produce consumo negativo cuando la recolección es menor que la entrega", () => {
    const rows = [
      row({ type: "delivery", hours_reading: 300, completed_at: "2026-01-01T00:00:00Z" }),
      row({ type: "pickup", hours_reading: 200, completed_at: "2026-02-01T00:00:00Z" }),
    ];
    expect(computeHourometer(rows).hoursUsed).toBeNull();
  });

  it("sin lecturas devuelve nulos", () => {
    expect(computeHourometer(undefined)).toEqual({
      deliveryHours: null,
      pickupHours: null,
      hoursUsed: null,
    });
  });
});
