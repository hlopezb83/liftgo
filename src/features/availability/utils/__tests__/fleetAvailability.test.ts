import { describe, it, expect } from "vitest";
import { computeFleetAvailability } from "../fleetAvailability";

/**
 * El resumen de flota respeta el estado persistido, pero una unidad
 * `available` con reserva confirmada vigente hoy cuenta como ocupada
 * (bug 2026-09-10: entregas nunca cerradas inflaban "disponibles").
 */

describe("computeFleetAvailability", () => {
  it("undefined forklifts → null", () => {
    expect(computeFleetAvailability(undefined, [])).toBeNull();
  });

  it("cuenta como rentada una unidad available con reserva confirmed vigente", () => {
    const forklifts = [{ id: "f-1", status: "available" }];
    const bookings = [
      { forklift_id: "f-1", status: "confirmed", start_date: "2026-06-10", end_date: "2026-06-20" },
    ];

    const result = computeFleetAvailability(forklifts, bookings, "2026-06-15");
    expect(result?.rentedForkliftIds.has("f-1")).toBe(true);
    expect(result?.rented).toBe(1);
    expect(result?.available).toBe(0);
  });

  it("una reserva futura o terminada no ocupa la unidad", () => {
    const forklifts = [{ id: "f-1", status: "available" }];
    const bookings = [
      { forklift_id: "f-1", status: "confirmed", start_date: "2026-07-01", end_date: "2026-07-10" },
    ];

    const result = computeFleetAvailability(forklifts, bookings, "2026-06-15");
    expect(result?.rented).toBe(0);
    expect(result?.available).toBe(1);
  });

  it("sin fecha de referencia conserva el estado persistido", () => {
    const forklifts = [{ id: "f-1", status: "available" }];
    const bookings = [
      { forklift_id: "f-1", status: "confirmed", start_date: "2026-06-10", end_date: "2026-06-20" },
    ];

    const result = computeFleetAvailability(forklifts, bookings);
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
