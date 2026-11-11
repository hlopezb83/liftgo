import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * v7.94.1 · Regresión de useQuoteBookingCreator con la RPC atómica
 * `convert_quote_with_customer_scoped`. Se valida el payload snake_case,
 * el manejo de error de la RPC y las invalidaciones de query.
 */

type RpcArgs = { p_quote_id: string; p_assignments: unknown; p_recurring: boolean };
const rpcMock = vi.fn<(fn: string, args: RpcArgs) => Promise<unknown>>();
const invalidateSpy = vi.fn();
const notifySuccess = vi.fn();
const notifyError = vi.fn();
const notifyValidation = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: RpcArgs) => rpcMock(fn, args),
    // `AuthContext` (y su captura de recuperación) se suscribe al montar:
    // el doble del SDK debe exponer Auth explícitamente.
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  },
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
    setShowConvertDialog: vi.fn(),
    setPendingConversion: vi.fn(),
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
    customers: [{ id: "c-1", address: "Calle 1" }, { id: "c-2", address: "Calle 2" }],
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

  it("convierte en una llamada y construye la entrega con el cliente confirmado", async () => {
    rpcMock.mockResolvedValue({
      data: ["f-1", "f-2"].map((forklift_id, index) => ({
        booking_id: `b-${index + 1}`, forklift_id, customer_id: "c-2", start_date: "2026-08-01", end_date: "2026-08-31",
      })),
      error: null,
    });
    const { state, data } = buildDeps();
    const { result } = renderHook(() => useQuoteBookingCreator(data, state));

    await result.current.createBookingsFor(
      [
        { forkliftId: "f-1", dailyRate: 100, weeklyRate: 0, monthlyRate: 0 },
        { forkliftId: "f-2", dailyRate: 0, weeklyRate: 500, monthlyRate: 2000 },
      ],
      { quoteId: "q-1", recurring: true, replacementCustomerId: "c-2" },
    );

    expect(rpcMock).toHaveBeenCalledOnce();
    expect(rpcMock).toHaveBeenCalledWith("convert_quote_with_customer_scoped", {
      p_quote_id: "q-1",
      p_assignments: [
        { forklift_id: "f-1", daily_rate: 100, weekly_rate: 0, monthly_rate: 0 },
        { forklift_id: "f-2", daily_rate: 0, weekly_rate: 500, monthly_rate: 2000 },
      ],
      p_recurring: true,
      p_replacement_customer_id: "c-2",
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(3);
    expect(notifySuccess).toHaveBeenCalledWith("2 reserva(s) creada(s) desde cotización");
    expect(state.setPendingDeliveries).toHaveBeenCalledWith([
      expect.objectContaining({ bookingId: "b-1", customerAddress: "Calle 2" }),
      expect.objectContaining({ bookingId: "b-2", customerAddress: "Calle 2" }),
    ]);
    expect(state.setShowAssignmentDialog).toHaveBeenCalledWith(false);
  });

  it("propaga el error de la RPC sin invalidar caches ni cerrar el diálogo", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "no disponible" } });
    const { state, data } = buildDeps();
    const { result } = renderHook(() => useQuoteBookingCreator(data, state));

    await result.current.createBookingsFor(
      [{ forkliftId: "f-1", dailyRate: 100, weeklyRate: 0, monthlyRate: 0 }],
      { quoteId: "q-1", recurring: false, replacementCustomerId: null },
    );

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(state.setShowAssignmentDialog).not.toHaveBeenCalledWith(false);
    expect(state.setIsConverting).toHaveBeenLastCalledWith(false);
  });
});
