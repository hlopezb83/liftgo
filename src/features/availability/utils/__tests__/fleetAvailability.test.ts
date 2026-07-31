import { describe, it, expect, vi, afterEach } from "vitest";
import { computeFleetAvailability } from "../fleetAvailability";

/**
 * R7-FE-01 (N7-UX-02): `computeFleetAvailability` es la ÚNICA definición de
 * "rentado" del frontend; el remap bidireccional de FleetPage/EquipmentListView
 * depende de que `rentedForkliftIds` refleje SOLO reservas confirmed vigentes
 * hoy (TZ Monterrey), sin importar el `status` crudo de la unidad.
 */

const TODAY = new Date("2026-06-15T12:00:00-06:00");

afterEach(() => {
  vi.useRealTimers();
});

describe("computeFleetAvailability", () => {
  it("undefined forklifts → null", () => {
    expect(computeFleetAvailability(undefined, [])).toBeNull();
  });

  it("marca como rentado un forklift 'available' crudo con reserva confirmed vigente", () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);

    const forklifts = [{ id: "f-1", status: "available" }];
    const bookings = [
      { forklift_id: "f-1", status: "confirmed", start_date: "2026-06-10", end_date: "2026-06-20" },
    ];

    const result = computeFleetAvailability(forklifts, bookings);
    expect(result?.rentedForkliftIds.has("f-1")).toBe(true);
    expect(result?.rented).toBe(1);
    expect(result?.available).toBe(0);
  });

  it("remap inverso: forklift 'rented' crudo SIN reserva vigente cuenta como available", () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);

    const forklifts = [{ id: "f-2", status: "rented" }];
    const bookings: never[] = [];

    const result = computeFleetAvailability(forklifts, bookings);
    expect(result?.rentedForkliftIds.has("f-2")).toBe(false);
    expect(result?.available).toBe(1);
    expect(result?.rented).toBe(0);
  });

  it("maintenance manda sobre la reserva: no cuenta como rentado aunque tenga booking vigente", () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);

    const forklifts = [{ id: "f-3", status: "maintenance" }];
    const bookings = [
      { forklift_id: "f-3", status: "confirmed", start_date: "2026-06-10", end_date: "2026-06-20" },
    ];

    const result = computeFleetAvailability(forklifts, bookings);
    expect(result?.maintenance).toBe(1);
    expect(result?.rented).toBe(0);
  });

  it("retired/sold no cuentan como flota activa", () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);

    const forklifts = [{ id: "f-4", status: "retired" }, { id: "f-5", status: "sold" }];
    const result = computeFleetAvailability(forklifts, []);
    expect(result?.totalActive).toBe(0);
  });
});
