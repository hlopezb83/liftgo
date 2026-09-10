import { describe, it, expect } from "vitest";
import { FORKLIFT_STATUS } from "@/lib/constants";
import {
  computeFleetAvailability,
  deriveForkliftDisplayStatus,
} from "../fleetAvailability";
import { toYMD } from "@/lib/date/toYMD";
import { nowMty } from "@/lib/utils";

const ref = nowMty();
const yesterday = toYMD(new Date(ref.getTime() - 86400000));
const tomorrow = toYMD(new Date(ref.getTime() + 86400000));

function availabilityFor(status: string, hasBooking: boolean) {
  const forklift = { id: "mc-1", status };
  const bookings = hasBooking
    ? [{ forklift_id: "mc-1", status: "confirmed", start_date: yesterday, end_date: tomorrow }]
    : [];
  return { forklift, availability: computeFleetAvailability([forklift], bookings) };
}

describe("deriveForkliftDisplayStatus", () => {
  it("muestra 'disponible' aunque exista una reserva vigente sin entrega", () => {
    const { forklift, availability } = availabilityFor(FORKLIFT_STATUS.available, true);
    expect(deriveForkliftDisplayStatus(forklift, availability)).toBe(FORKLIFT_STATUS.available);
  });

  it("muestra 'rentado' aunque la consulta no incluya la reserva que originó la entrega", () => {
    const { forklift, availability } = availabilityFor(FORKLIFT_STATUS.rented, false);
    expect(deriveForkliftDisplayStatus(forklift, availability)).toBe(FORKLIFT_STATUS.rented);
  });

  it("respeta mantenimiento aunque exista una reserva vigente", () => {
    const { forklift, availability } = availabilityFor(FORKLIFT_STATUS.maintenance, true);
    expect(deriveForkliftDisplayStatus(forklift, availability)).toBe(FORKLIFT_STATUS.maintenance);
  });

  it("respeta retirado y vendido", () => {
    for (const status of [FORKLIFT_STATUS.retired, FORKLIFT_STATUS.sold]) {
      const { forklift, availability } = availabilityFor(status, false);
      expect(deriveForkliftDisplayStatus(forklift, availability)).toBe(status);
    }
  });

  it("cae al status crudo mientras no hay datos de reservas", () => {
    expect(deriveForkliftDisplayStatus({ id: "mc-1", status: "available" }, null)).toBe("available");
  });

  it("devuelve undefined sin unidad", () => {
    expect(deriveForkliftDisplayStatus(undefined, null)).toBeUndefined();
  });
});
