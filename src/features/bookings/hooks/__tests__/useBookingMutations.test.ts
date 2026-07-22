import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import {
  createSupabaseChainMock,
  type ChainResolver,
} from "@/test/helpers/supabaseChain";

// vi.mock se hoistea — el estado mutable y los resolvers deben vivir dentro
// de vi.hoisted() para estar disponibles cuando el factory se evalúa.
const h = vi.hoisted(() => {
  const state = {
    createResp: {
      data: "new-id" as string | null,
      error: null as { code?: string; message: string } | null,
    },
    updateResp: {
      data: { id: "b-1" } as { id: string } | null,
      error: null as { code?: string; message: string } | null,
    },
    deleteError: null as { code?: string; message: string } | null,
    cancelError: null as { code?: string; message: string } | null,
  };
  const bookingsResolver = (calls: { method: string; args: unknown[] }[]) => {
    if (calls.some((c) => c.method === "update")) {
      return { data: state.updateResp.data, error: state.updateResp.error };
    }
    if (calls.some((c) => c.method === "delete")) {
      return { data: null, error: state.deleteError };
    }
    return { data: [], error: null };
  };
  return { state, bookingsResolver };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: { bookings: h.bookingsResolver as ChainResolver },
    rpcResolvers: {
      create_booking: () => h.state.createResp,
      cancel_booking: () => ({ data: null, error: h.state.cancelError }),
    },
  }),
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

import {
  useCreateBooking,
  useUpdateBooking,
  useDeleteBooking,
  useCancelBooking,
} from "../bookings/useBookingMutations";

describe("useBookingMutations", () => {
  beforeEach(() => {
    h.state.createResp = { data: "new-id", error: null };
    h.state.updateResp = { data: { id: "b-1" }, error: null };
    h.state.deleteError = null;
    h.state.cancelError = null;
  });

  it("create: éxito devuelve id desde RPC create_booking", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateBooking(), { wrapper: Wrapper });
    result.current.mutate({
      forklift_id: "f-1",
      start_date: "2026-03-01",
      end_date: "2026-03-15",
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe("new-id");
  });

  it("create: propaga error de RPC", async () => {
    h.state.createResp = {
      data: null,
      error: { code: "P0001", message: "forklift_unavailable" },
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateBooking(), { wrapper: Wrapper });
    result.current.mutate({
      forklift_id: "f-1",
      start_date: "2026-03-01",
      end_date: "2026-03-15",
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("update: éxito", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUpdateBooking(), { wrapper: Wrapper });
    result.current.mutate({ id: "b-1", end_date: "2026-04-01" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("delete: propaga error 42501 (RLS)", async () => {
    h.state.deleteError = { code: "42501", message: "permission denied" };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useDeleteBooking(), { wrapper: Wrapper });
    result.current.mutate("b-1");
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("cancel: RPC error propagado", async () => {
    h.state.cancelError = { code: "P0001", message: "already cancelled" };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCancelBooking(), { wrapper: Wrapper });
    result.current.mutate("b-1");
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  // R7 Bloque 20: guard SQL rechaza reservas ya canceladas/completadas.
  it("cancel: propaga mensaje del guard SQL (estado cancelled/completed)", async () => {
    h.state.cancelError = {
      code: "P0001",
      message: "No se puede cancelar una reserva en estado cancelled",
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCancelBooking(), { wrapper: Wrapper });
    result.current.mutate("b-1");
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain("estado cancelled");
  });
});

