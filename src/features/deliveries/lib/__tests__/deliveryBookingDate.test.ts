import { describe, expect, it } from "vitest";
import { deliveryBookingDateError, suggestedDateAfterTransportTypeChange, suggestedScheduledTransportDate } from "../deliveryBookingDate";

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

describe("suggestedScheduledTransportDate", () => {
  it("suggests the booking start for a future delivery and the end for a future pickup", () => {
    expect(suggestedScheduledTransportDate("delivery", "2026-09-24", booking, "2026-09-24", false)).toBe("2026-11-09");
    expect(suggestedScheduledTransportDate("pickup", "2026-09-24", booking, "2026-09-24", false)).toBe("2026-11-13");
  });

  it("preserves an operator-selected date inside the allowed period", () => {
    expect(suggestedScheduledTransportDate("delivery", "2026-11-10", booking, "2026-09-24", false)).toBeNull();
    expect(suggestedScheduledTransportDate("pickup", "2026-11-14", booking, "2026-09-24", false)).toBeNull();
  });

  it("does not suggest a past delivery unless it is historical", () => {
    expect(suggestedScheduledTransportDate("delivery", "2026-12-01", booking, "2026-11-20", false)).toBeNull();
    expect(suggestedScheduledTransportDate("delivery", "2026-12-01", booking, "2026-11-20", true)).toBe("2026-11-09");
  });

  it("suggests today for a late pickup when the booking has ended", () => {
    expect(suggestedScheduledTransportDate("pickup", "2026-11-08", booking, "2026-11-20", false)).toBe("2026-11-20");
  });
});

describe("suggestedDateAfterTransportTypeChange", () => {
  it("moves an automatically proposed delivery date to the pickup end date", () => {
    expect(suggestedDateAfterTransportTypeChange(
      "pickup", "2026-11-09", "2026-11-09", booking, "2026-09-24", false,
    )).toBe("2026-11-13");
  });

  it("moves an automatically proposed pickup date back to the delivery start", () => {
    expect(suggestedDateAfterTransportTypeChange(
      "delivery", "2026-11-13", "2026-11-13", booking, "2026-09-24", false,
    )).toBe("2026-11-09");
  });

  it("keeps a date changed by the operator", () => {
    expect(suggestedDateAfterTransportTypeChange(
      "pickup", "2026-11-10", "2026-11-09", booking, "2026-09-24", false,
    )).toBeNull();
  });
});
