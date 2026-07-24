// TESTS-ARQ2 v2 · DIFF 12 (starter): `useGanttSegments` no tenía cobertura.
// Este starter blinda 3 invariantes visuales del Gantt de calendario:
//   1. Reservas fuera del rango visible no producen segmentos.
//   2. Rangos parcialmente fuera se recortan (clamp) al viewport.
//   3. Reservas con estatus no rentable (`quoted`) se ignoran.
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useGanttSegments } from "../useGanttSegments";
import type { BookingWithForklift } from "@/features/bookings";

const forkliftA = "flt-1";
const RANGE_START = new Date("2026-06-01T00:00:00");
const RANGE_END = new Date("2026-06-30T00:00:00");

function b(
  overrides: Partial<BookingWithForklift> & { start_date: string; end_date: string; status: string },
): BookingWithForklift {
  return {
    id: crypto.randomUUID(),
    forklift_id: forkliftA,
    customer_name: "ACME",
    ...overrides,
  } as unknown as BookingWithForklift;
}

describe("useGanttSegments", () => {
  it("reserva completamente fuera del rango → sin segmentos", () => {
    const bookings = [
      b({ start_date: "2026-05-01", end_date: "2026-05-10", status: "confirmed" }),
      b({ start_date: "2026-07-01", end_date: "2026-07-10", status: "confirmed" }),
    ];
    const { result } = renderHook(() =>
      useGanttSegments(bookings, RANGE_START, RANGE_END),
    );
    expect(result.current.getSegments(forkliftA)).toEqual([]);
  });

  it("reserva parcialmente fuera → clampeada al viewport (0% ≤ left+width ≤ 100%)", () => {
    const bookings = [
      b({ start_date: "2026-05-25", end_date: "2026-06-05", status: "confirmed" }),
    ];
    const { result } = renderHook(() =>
      useGanttSegments(bookings, RANGE_START, RANGE_END),
    );
    const seg = result.current.getSegments(forkliftA);
    expect(seg).toHaveLength(1);
    expect(seg[0].leftPercent).toBe(0);
    expect(seg[0].widthPercent).toBeGreaterThan(0);
    expect(seg[0].leftPercent + seg[0].widthPercent).toBeLessThanOrEqual(100);
  });

  it("status no rentable (quoted) → excluida del render", () => {
    const bookings = [
      b({ start_date: "2026-06-05", end_date: "2026-06-10", status: "quoted" }),
      b({ start_date: "2026-06-15", end_date: "2026-06-20", status: "confirmed" }),
    ];
    const { result } = renderHook(() =>
      useGanttSegments(bookings, RANGE_START, RANGE_END),
    );
    expect(result.current.getSegments(forkliftA)).toHaveLength(1);
  });

  it("mismo cliente en distintas reservas → mismo color (hash estable)", () => {
    const bookings = [
      b({ customer_name: "ACME", start_date: "2026-06-02", end_date: "2026-06-05", status: "confirmed" }),
      b({ customer_name: "ACME", start_date: "2026-06-10", end_date: "2026-06-14", status: "completed" }),
    ];
    const { result } = renderHook(() =>
      useGanttSegments(bookings, RANGE_START, RANGE_END),
    );
    const seg = result.current.getSegments(forkliftA);
    expect(seg).toHaveLength(2);
    expect(seg[0].color).toBe(seg[1].color);
  });
});
