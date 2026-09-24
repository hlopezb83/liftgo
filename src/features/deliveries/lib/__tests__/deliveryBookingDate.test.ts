import { describe, expect, it } from "vitest";
import { deliveryBookingDateError } from "../deliveryBookingDate";

const booking = { start_date: "2026-11-09", end_date: "2026-11-13" };

describe("deliveryBookingDateError", () => {
  it("accepts a delivery on either boundary of the rental period", () => {
    expect(deliveryBookingDateError("delivery", booking.start_date, booking)).toBeNull();
    expect(deliveryBookingDateError("delivery", booking.end_date, booking)).toBeNull();
  });

  it("rejects a delivery outside the rental period", () => {
    expect(deliveryBookingDateError("delivery", "2026-11-08", booking)).toContain("dentro del periodo");
    expect(deliveryBookingDateError("delivery", "2026-11-14", booking)).toContain("dentro del periodo");
  });

  it("allows pickup after the rental ends but not before it starts", () => {
    expect(deliveryBookingDateError("pickup", "2026-11-14", booking)).toBeNull();
    expect(deliveryBookingDateError("pickup", "2026-11-08", booking)).toContain("anterior al inicio");
  });

  it("does not apply delivery or pickup limits to legacy return transport", () => {
    expect(deliveryBookingDateError("return", "2026-11-08", booking)).toBeNull();
    expect(deliveryBookingDateError("return", "2026-11-14", booking)).toBeNull();
  });
});
