import { describe, it, expect } from "vitest";
import { computeFleetAvailability } from "../fleetAvailability";

/**
 * El resumen de flota respeta el estado canónico persistido. Una reserva, aun
 * vigente hoy, no equivale a una entrega completada.
 */

describe("computeFleetAvailability", () => {
  it("undefined forklifts → null", () => {
    expect(computeFleetAvailability(undefined, [])).toBeNull();
  });

  it("mantiene disponible una unidad aunque tenga reserva confirmed vigente", () => {
    const forklifts = [{ id: "f-1", status: "available" }];
    const bookings = [
      { forklift_id: "f-1", status: "confirmed", start_date: "2026-06-10", end_date: "2026-06-20" },
    ];

    const result = computeFleetAvailability(forklifts, bookings);
    expect(result?.rentedForkliftIds.has("f-1")).toBe(false);
    expect(result?.rented).toBe(0);
    expect(result?.available).toBe(1);
  });

  it("mantiene rentada una unidad sin reinterpretarla por ausencia de reservas en la consulta", () => {
    const forklifts = [{ id: "f-2", status: "rented" }];
    const bookings: never[] = [];

    const result = computeFleetAvailability(forklifts, bookings);
    expect(result?.rentedForkliftIds.has("f-2")).toBe(true);
    expect(result?.available).toBe(0);
    expect(result?.rented).toBe(1);
  });

  it("maintenance no cuenta como rentado aunque tenga booking vigente", () => {
    const forklifts = [{ id: "f-3", status: "maintenance" }];
    const bookings = [
      { forklift_id: "f-3", status: "confirmed", start_date: "2026-06-10", end_date: "2026-06-20" },
    ];

    const result = computeFleetAvailability(forklifts, bookings);
    expect(result?.maintenance).toBe(1);
    expect(result?.rented).toBe(0);
  });

  it("retired/sold no cuentan como flota activa", () => {
    const forklifts = [{ id: "f-4", status: "retired" }, { id: "f-5", status: "sold" }];
    const result = computeFleetAvailability(forklifts, []);
    expect(result?.totalActive).toBe(0);
  });
});
