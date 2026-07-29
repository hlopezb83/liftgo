/**
 * Lote 8 — Máquina de estados de bookings.
 * Fuente: src/features/bookings/hooks/useBookingActionsLogic.ts
 *
 * Transiciones reales (switch/case):
 *   "confirmed"  → ["cancelled"] (D3-r3: "completar" se retiró; el cierre ocurre en /returns)
 *   "completed"  → [] (terminal: R2-5, evita revivir reservas completadas)
 *   "cancelled"  → [] (terminal: P0-2, evita revivir reservas canceladas)
 *   default      → []
 */
import { describe, it, expect } from "vitest";
import { getValidTransitions } from "@/features/bookings";

describe("getValidTransitions", () => {
  it('confirmed → solo "cancelled" (completar ocurre vía /returns, D3-r3)', () => {
    const result = getValidTransitions("confirmed");
    expect(result).toContain("cancelled");
    expect(result).toHaveLength(1);
  });

  it('completed → [] (terminal, no se puede revivir a confirmed)', () => {
    expect(getValidTransitions("completed")).toEqual([]);
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
