import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * v7.94.1 · Regresión de useQuoteBookingCreator con la RPC atómica
 * `convert_quote_to_bookings` (BL-32). Se valida el payload snake_case,
 * el manejo de error de la RPC y las invalidaciones de query.
 */

type RpcArgs = { p_quote_id: string; p_assignments: unknown; p_recurring: boolean };
const rpcMock = vi.fn<(fn: string, args: RpcArgs) => Promise<unknown>>();
const invalidateSpy = vi.fn();
const notifySuccess = vi.fn();
const notifyError = vi.fn();
const notifyValidation = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (fn: string, args: RpcArgs) => rpcMock(fn, args) },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateSpy }),
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifySuccess: (...args: unknown[]) => notifySuccess(...args),
  notifyError: (...args: unknown[]) => notifyError(...args),
  notifyValidation: (...args: unknown[]) => notifyValidation(...args),
}));

import { useQuoteBookingCreator } from "../useQuoteBookingCreator";

function buildDeps() {
  const state = {
    setIsConverting: vi.fn(),
    setShowAssignmentDialog: vi.fn(),
    setCurrentDeliveryIndex: vi.fn(),
    setPendingDeliveries: vi.fn(),
  } as unknown as Parameters<typeof useQuoteBookingCreator>[1];
  const data = {
    quote: {
      id: "q-1",
      customer_id: "c-1",
      customer_name: "Cliente",
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    },
    customers: [{ id: "c-1", address: "Calle 1" }],
    forklifts: [
      { id: "f-1", name: "Toyota A" },
      { id: "f-2", name: "Toyota B" },
    ],
  } as unknown as Parameters<typeof useQuoteBookingCreator>[0];
  return { state, data };
}


describe("useQuoteBookingCreator (BL-32, v7.94.1)", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    invalidateSpy.mockReset();
    notifySuccess.mockReset();
    notifyError.mockReset();
    invalidateSpy.mockResolvedValue(undefined);
  });

  it("llama a convert_quote_to_bookings con payload snake_case y difunde IDs devueltos", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { booking_id: "b-1", forklift_id: "f-1" },
        { booking_id: "b-2", forklift_id: "f-2" },
      ],
      error: null,
    });
    const { state, data } = buildDeps();
    const { createBookingsFor } = useQuoteBookingCreator(data, state);

    await createBookingsFor(
      [
        { forkliftId: "f-1", dailyRate: 100, weeklyRate: 0, monthlyRate: 0 },
        { forkliftId: "f-2", dailyRate: 0, weeklyRate: 500, monthlyRate: 2000 },
      ],
      true,
    );

    expect(rpcMock).toHaveBeenCalledWith("convert_quote_to_bookings", {
      p_quote_id: "q-1",
      p_assignments: [
        { forklift_id: "f-1", daily_rate: 100, weekly_rate: 0, monthly_rate: 0 },
        { forklift_id: "f-2", daily_rate: 0, weekly_rate: 500, monthly_rate: 2000 },
      ],
      p_recurring: true,
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(3);
    expect(notifySuccess).toHaveBeenCalledWith("2 reserva(s) creada(s) desde cotización");
    expect(state.setPendingDeliveries).toHaveBeenCalledTimes(1);
    expect(state.setShowAssignmentDialog).toHaveBeenCalledWith(false);
  });

  it("propaga el error de la RPC sin invalidar caches ni cerrar el diálogo", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "no disponible" } });
    const { state, data } = buildDeps();
    const { createBookingsFor } = useQuoteBookingCreator(data, state);

    await createBookingsFor(
      [{ forkliftId: "f-1", dailyRate: 100, weeklyRate: 0, monthlyRate: 0 }],
      false,
    );

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(state.setShowAssignmentDialog).not.toHaveBeenCalledWith(false);
    expect(state.setIsConverting).toHaveBeenLastCalledWith(false);
  });
});
