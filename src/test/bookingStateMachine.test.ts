/**
 * Lote 8 — Máquina de estados de bookings.
 * Fuente: src/features/bookings/hooks/useBookingActionsLogic.ts
 *
 * Transiciones reales (switch/case):
 *   "confirmed"  → ["completed", "cancelled"]
 *   "completed"  → ["confirmed"]
 *   "cancelled"  → [] (terminal: P0-2, evita revivir reservas canceladas)
 *   default      → []
 */
import { describe, it, expect } from "vitest";
import { getValidTransitions } from "@/features/bookings";

describe("getValidTransitions", () => {
  it('confirmed → incluye "completed" y "cancelled"', () => {
    const result = getValidTransitions("confirmed");
    expect(result).toContain("completed");
    expect(result).toContain("cancelled");
    expect(result).toHaveLength(2);
  });

  it('completed → ["confirmed"]', () => {
    expect(getValidTransitions("completed")).toEqual(["confirmed"]);
  });

  it('cancelled → [] (terminal, no se puede revivir)', () => {
    expect(getValidTransitions("cancelled")).toEqual([]);
  });

  it("estado desconocido → []", () => {
    expect(getValidTransitions("pending")).toEqual([]);
    expect(getValidTransitions("")).toEqual([]);
    expect(getValidTransitions("CONFIRMED")).toEqual([]);
  });
});
