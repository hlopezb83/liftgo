import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";
import { createQueryWrapper } from "@/test/helpers/queryClient";

// Resolver mutable por test — el mock se construye una sola vez.
let createBookingResp: SupabaseMockResponse = { data: "new-booking-id", error: null };
const createBookingResolver = vi.fn((_args: unknown) => createBookingResp);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    rpcResolvers: {
      create_booking: (args) => createBookingResolver(args),
    },
  }),
}));

const notifyErrorMock = vi.fn();
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

import { useCreateBooking } from "@/features/bookings";

describe("useCreateBooking — hook real", () => {
  beforeEach(() => {
    createBookingResp = { data: "new-booking-id", error: null };
    createBookingResolver.mockClear();
    notifyErrorMock.mockClear();
  });

  it("happy path: invoca create_booking con payload p_* mapeado e invalida queries", async () => {
    const { Wrapper, queryClient } = createQueryWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateBooking(), { wrapper: Wrapper });

    const id = await result.current.mutateAsync({
      forklift_id: "fork-1",
      customer_id: "cust-1",
      customer_name: "ACME Corp",
      customer_contact: "555-1234",
      start_date: "2026-03-01",
      end_date: "2026-03-15",
      recurring_billing: true,
    });

    expect(id).toBe("new-booking-id");
    expect(createBookingResolver).toHaveBeenCalledWith({
      p_forklift_id: "fork-1",
      p_customer_id: "cust-1",
      p_customer_name: "ACME Corp",
      p_customer_contact: "555-1234",
      p_start_date: "2026-03-01",
      p_end_date: "2026-03-15",
      p_recurring_billing: true,
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["bookings"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["forklifts"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["status_logs"] });
    });
    expect(notifyErrorMock).not.toHaveBeenCalled();
  });

  it("propaga error del RPC y llama notifyError", async () => {
    createBookingResp = {
      data: null,
      error: { message: "Forklift not available in the selected window" },
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateBooking(), { wrapper: Wrapper });

    await expect(
      result.current.mutateAsync({
        forklift_id: "fork-1",
        customer_name: "X",
        customer_contact: "1",
        start_date: "2026-03-01",
        end_date: "2026-03-15",
      }),
    ).rejects.toMatchObject({ message: "Forklift not available in the selected window" });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalledTimes(1));
    expect(notifyErrorMock.mock.calls[0][0]).toMatchObject({
      title: "Error al crear reserva",
    });
  });

  it("recurring_billing por defecto se serializa a false", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateBooking(), { wrapper: Wrapper });

    await result.current.mutateAsync({
      forklift_id: "fork-1",
      customer_name: "X",
      customer_contact: "1",
      start_date: "2026-03-01",
      end_date: "2026-03-15",
    });

    expect(createBookingResolver).toHaveBeenCalledWith(
      expect.objectContaining({ p_recurring_billing: false }),
    );
  });
});
