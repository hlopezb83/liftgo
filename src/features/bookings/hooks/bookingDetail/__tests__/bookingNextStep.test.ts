import { describe, expect, it } from "vitest";
import type { HistoricalReconciliation } from "@/features/deliveries";
import { bookingNextStep, type BookingTransport } from "../bookingNextStep";

const booking = { status: "confirmed", start_date: "2026-11-01", end_date: "2026-11-15", return_status: null };
const today = "2026-11-11";
const row = (overrides: Partial<BookingTransport> = {}): BookingTransport => ({
  id: "transport-1", type: "delivery", status: "completed", completed_at: "2026-11-01T18:00:00Z", ...overrides,
});
const state = (deliveries: BookingTransport[] | undefined = []) => ({ deliveries, isLoading: false, isError: false });

describe("bookingNextStep · verified operation matrix", () => {
  it.each(["completed", "cancelled", "pending"])("does not schedule for %s", (status) => {
    expect(bookingNextStep({ ...booking, status }, state(), today).action).toBeUndefined();
  });
  it("does not restart a confirmed booking with an existing return", () => {
    expect(bookingNextStep({ ...booking, return_status: "good" }, state(), today).action).toBeUndefined();
  });
  it.each([
    { deliveries: undefined, isLoading: true, isError: false },
    { deliveries: [], isLoading: true, isError: false },
    { deliveries: [], isLoading: false, isError: true },
    { deliveries: undefined, isLoading: false, isError: false },
  ])("does not infer absence from an unverified query %j", (transports) => {
    expect(bookingNextStep(booking, transports, today).action).toBeUndefined();
  });
  it.each([{ deliveries: [] }, { deliveries: [row({ status: "cancelled" })] }])("schedules delivery with no live/completed transport: %j", ({ deliveries }) => {
    expect(bookingNextStep(booking, state(deliveries), today).action).toMatchObject({ kind: "schedule", type: "delivery" });
  });
  it.each(["scheduled", "in_transit"])("opens the existing %s delivery", (status) => {
    expect(bookingNextStep(booking, state([row({ status })]), today).action).toMatchObject({ kind: "transport", id: "transport-1" });
  });
  it("opens a scheduled pickup even when the booking has no verified completed delivery", () => {
    expect(bookingNextStep(booking, state([row({ type: "pickup", status: "scheduled" })]), today).action).toMatchObject({ kind: "transport", id: "transport-1" });
  });
  it("requires review of multiple pending transports", () => {
    expect(bookingNextStep(booking, state([row({ status: "scheduled" }), row({ type: "pickup", status: "in_transit" })]), today).action?.kind).toBe("review");
  });
  it("suggests pickup only after a verified delivery", () => {
    expect(bookingNextStep(booking, state([row()]), today).action).toMatchObject({ kind: "schedule", type: "pickup" });
  });
  it.each(["2026-11-14", "2026-11-15", "2026-11-16"])("reuses the return guard and early flag on %s", (day) => {
    expect(bookingNextStep(booking, state([row(), row({ type: "pickup" })]), day).action).toMatchObject({ kind: "return", early: day < booking.end_date });
  });
  it.each(["2026-11-12T06:01:00Z", "invalid"])("does not infer delivery completion from %s", (completed_at) => {
    expect(bookingNextStep(booking, state([row({ completed_at })]), today).action?.kind).toBe("review");
  });
  it("uses Monterrey calendar day for evidence around UTC midnight", () => {
    expect(bookingNextStep(booking, state([row({ completed_at: "2026-11-12T05:59:00Z" })]), today).action).toMatchObject({ kind: "schedule", type: "pickup" });
  });
  it("does not invent a new delivery for an expired period or a pickup without delivery", () => {
    expect(bookingNextStep({ ...booking, end_date: "2026-11-10" }, state(), today).action?.kind).toBe("review");
    expect(bookingNextStep(booking, state([row({ type: "pickup" })]), today).action?.kind).toBe("review");
  });
  it("does not infer absence from a truncated list (501 rows), but accepts exactly 500", () => {
    const cancelled = Array.from({ length: 500 }, (_, index) => row({ id: String(index), status: "cancelled" }));
    expect(bookingNextStep(booking, state(cancelled), today).action?.kind).toBe("schedule");
    expect(bookingNextStep(booking, state([...cancelled, row({ status: "cancelled" })]), today).action?.kind).toBe("review");
  });
  it("preserves reconciled history, while revoked reconciliation no longer blocks an active transport", () => {
    const historical_reconciliation = { revoked_at: null } as HistoricalReconciliation;
    expect(bookingNextStep(booking, state([row({ status: "scheduled", historical_reconciliation })]), today).action?.kind).toBe("review");
    expect(bookingNextStep(booking, state([row({ status: "scheduled", historical_reconciliation: { ...historical_reconciliation, revoked_at: "2026-11-01" } })]), today).action?.kind).toBe("transport");
  });
});
