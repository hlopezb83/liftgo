import { describe, it, expect } from "vitest";
import { isPartialRange, nextRangeState } from "../DateRangePickerField";

const d = (day: number) => new Date(2026, 7, day); // agosto 2026

describe("R10-FE-02 · estado del rango de fechas", () => {
  it("primer clic (from == to) es parcial y NO auto-aplica", () => {
    const r = nextRangeState(undefined, { from: d(5), to: d(5) });
    expect(r.apply).toBe(false);
    expect(isPartialRange(r.range)).toBe(true);
  });

  it("segundo clic cierra el rango y auto-aplica (sin necesitar un tercero)", () => {
    const first = nextRangeState(undefined, { from: d(5), to: d(5) });
    const second = nextRangeState(first.range, { from: d(5), to: d(20) });
    expect(second.apply).toBe(true);
    expect(second.range?.from?.getDate()).toBe(5);
    expect(second.range?.to?.getDate()).toBe(20);
  });

  it("con un rango REAL previo, un clic nuevo reinicia la selección (R6-FE-11c)", () => {
    const complete = { from: d(5), to: d(20) };
    const restart = nextRangeState(complete, { from: d(12), to: d(20) });
    expect(restart.apply).toBe(false);
    expect(restart.range?.from?.getDate()).toBe(12);
    expect(restart.range?.to).toBeUndefined();
  });

  it("normaliza a medianoche local", () => {
    const r = nextRangeState(undefined, {
      from: new Date(2026, 7, 5, 18, 30),
      to: new Date(2026, 7, 20, 23, 59),
    });
    expect(r.range?.from?.getHours()).toBe(0);
    expect(r.range?.to?.getHours()).toBe(0);
  });

  it("isPartialRange: sin `to` también es parcial; rango real no lo es", () => {
    expect(isPartialRange({ from: d(5), to: undefined })).toBe(true);
    expect(isPartialRange({ from: d(5), to: d(6) })).toBe(false);
    expect(isPartialRange(undefined)).toBe(false);
  });
});
