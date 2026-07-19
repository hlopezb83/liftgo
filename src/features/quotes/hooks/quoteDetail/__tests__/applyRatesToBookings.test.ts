import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * applyRatesToBookings (BL-31): guarda tarifas negociadas por reserva.
 * - Sólo debe emitir un UPDATE por reserva con al menos una tarifa > 0.
 * - Debe omitir campos con tarifa <= 0.
 * - Devuelve el conteo de reservas actualizadas exitosamente.
 */

const bookingUpdates: Array<{ id: string; payload: Record<string, unknown> }> = [];

let updateResp: { data: unknown; error: { message: string } | null } = {
  data: [{ id: "ok" }],
  error: null,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      bookings: (calls) => {
        const upd = calls.find((c) => c.method === "update");
        const eq = calls.find((c) => c.method === "eq");
        if (upd && eq) {
          bookingUpdates.push({
            id: String(eq.args[1]),
            payload: upd.args[0] as Record<string, unknown>,
          });
        }
        return updateResp;
      },
    },
  }),
}));

import { applyRatesToBookings } from "../quoteBookingBuilders";

beforeEach(() => {
  bookingUpdates.length = 0;
  updateResp = { data: [{ id: "ok" }], error: null };
});

describe("applyRatesToBookings", () => {
  it("sólo actualiza reservas con al menos una tarifa > 0", async () => {
    const count = await applyRatesToBookings([
      { bookingId: "b-1", forkliftId: "f-1", dailyRate: 500, weeklyRate: 0, monthlyRate: 0 },
      { bookingId: "b-2", forkliftId: "f-2", dailyRate: 0, weeklyRate: 0, monthlyRate: 0 },
      { bookingId: "b-3", forkliftId: "f-3", dailyRate: 0, weeklyRate: 2000, monthlyRate: 8000 },
    ]);

    expect(count).toBe(2);
    expect(bookingUpdates).toHaveLength(2);
    expect(bookingUpdates[0]).toEqual({ id: "b-1", payload: { daily_rate: 500 } });
    expect(bookingUpdates[1]).toEqual({
      id: "b-3",
      payload: { weekly_rate: 2000, monthly_rate: 8000 },
    });
  });

  it("devuelve 0 cuando ninguna asignación trae tarifas positivas", async () => {
    const count = await applyRatesToBookings([
      { bookingId: "b-1", forkliftId: "f-1", dailyRate: 0, weeklyRate: 0, monthlyRate: 0 },
    ]);
    expect(count).toBe(0);
    expect(bookingUpdates).toHaveLength(0);
  });

  it("no cuenta reservas cuyo update devuelve error", async () => {
    updateResp = { data: null, error: { message: "rls" } };
    const count = await applyRatesToBookings([
      { bookingId: "b-1", forkliftId: "f-1", dailyRate: 500, weeklyRate: 0, monthlyRate: 0 },
    ]);
    expect(count).toBe(0);
  });
});
