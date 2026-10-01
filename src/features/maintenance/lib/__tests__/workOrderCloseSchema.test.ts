import { afterEach, describe, expect, it, vi } from "vitest";
import { workOrderCloseSchema } from "../workOrderCloseSchema";

afterEach(() => vi.useRealTimers());

describe("cierre de OT con fecha de Monterrey", () => {
  it("rechaza mañana cuando UTC ya cambió de día pero Monterrey no", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T02:00:00Z"));
    expect(workOrderCloseSchema.safeParse({ closed_at: new Date(2026, 8, 30) }).success).toBe(true);
    const future = workOrderCloseSchema.safeParse({ closed_at: new Date(2026, 9, 1) });
    expect(future.success).toBe(false);
    if (!future.success) expect(future.error.issues[0].message).toBe("La fecha de cierre no puede ser futura");
  });

  it("localiza una fecha vacía y permite registrar un cierre anterior", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T18:00:00Z"));
    const missing = workOrderCloseSchema.safeParse({});
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.error.issues[0].message).toBe("Selecciona una fecha de cierre válida");
    expect(workOrderCloseSchema.safeParse({ closed_at: new Date(2026, 8, 29) }).success).toBe(true);
  });
});
