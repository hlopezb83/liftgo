import { describe, expect, it } from "vitest";
import { explainUnavailableUnit, overlapsRequestedRange, type AvailabilityBooking, type AvailabilityUnit } from "../availabilityReasons";

const unit: AvailabilityUnit = { id: "f1", name: "Unidad 1", model: "Modelo", status: "available", organization_id: "a" };
const booking: AvailabilityBooking = { id: "b1", forklift_id: "f1", organization_id: "a", status: "confirmed", start_date: "2026-10-01", end_date: "2026-10-05" };

describe("availability reasons: verified evidence and priority", () => {
  it.each(["retired", "sold"])("%s outranks maintenance, custody and reservation", (status) => {
    expect(explainUnavailableUnit({ unit: { ...unit, status }, maintenanceBlocked: true, overdueUnreturned: true, overlappingBooking: booking }).code).toBe(status);
  });
  it("maintenance outranks unreturned and overlapping bookings", () => {
    expect(explainUnavailableUnit({ unit, maintenanceBlocked: true, overdueUnreturned: true, overlappingBooking: booking }).code).toBe("maintenance");
  });
  it("persisted maintenance does not require protected work-order details", () => {
    expect(explainUnavailableUnit({ unit: { ...unit, status: "maintenance" } }).code).toBe("maintenance");
  });
  it("overdue unreturned reservation outranks a calendar conflict", () => {
    const reason = explainUnavailableUnit({ unit, overdueUnreturned: true, overlappingBooking: booking });
    expect(reason.code).toBe("return_pending");
    expect(reason.detail).toContain("sin devolución registrada");
    expect(reason.nextAction).toContain("devolución real");
  });
  it("verified reservation outranks a generic rented status", () => {
    const reason = explainUnavailableUnit({ unit: { ...unit, status: "rented" }, overlappingBooking: booking });
    expect(reason.code).toBe("reservation");
    expect(reason.detail).toContain("2026-10-05");
  });
  it("rented status is not claimed as proof of physical custody or an exact blocker", () => {
    const reason = explainUnavailableUnit({ unit: { ...unit, status: "rented" } });
    expect(reason.code).toBe("rented");
    expect(reason.detail).toContain("No se pudo confirmar");
    expect(reason.nextAction).toContain("No cambies el estado");
  });
  it.each(["available", "custom-status"])("unknown evidence stays unknown for %s", (status) => {
    expect(explainUnavailableUnit({ unit: { ...unit, status }, maintenanceBlocked: false }).code).toBe("unknown");
  });
  it("missing model is not invented as an operational cause", () => {
    expect(explainUnavailableUnit({ unit: { ...unit, model: "" } }).code).toBe("unknown");
  });
  it("does not mutate evidence", () => {
    const frozen = Object.freeze({ ...unit, status: "rented" });
    explainUnavailableUnit({ unit: frozen });
    expect(frozen.status).toBe("rented");
  });
  it("overlap is inclusive on both ends", () => {
    expect(overlapsRequestedRange(booking, "2026-10-05", "2026-10-10")).toBe(true);
    expect(overlapsRequestedRange(booking, "2026-10-06", "2026-10-10")).toBe(false);
  });
  it.each(["completed", "cancelled"])("%s does not block the calendar", (status) => {
    expect(overlapsRequestedRange({ ...booking, status }, "2026-10-01", "2026-10-05")).toBe(false);
  });
});
