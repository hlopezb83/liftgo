import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  createSupabaseChainMock,
  type ChainResolver,
} from "@/test/helpers/supabaseChain";
import { createQueryWrapper } from "@/test/helpers/queryClient";

const state = {
  createResp: { data: "new-id", error: null as { code?: string; message: string } | null },
  updateResp: { data: { id: "b-1" }, error: null as { code?: string; message: string } | null },
  deleteError: null as { code?: string; message: string } | null,
  cancelError: null as { code?: string; message: string } | null,
};

const bookingsResolver: ChainResolver = (calls) => {
  if (calls.some((c) => c.method === "update")) {
    return { data: state.updateResp.data, error: state.updateResp.error };
  }
  if (calls.some((c) => c.method === "delete")) {
    return { data: null, error: state.deleteError };
  }
  return { data: [], error: null };
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: { bookings: bookingsResolver },
    rpcResolvers: {
      create_booking: () => state.createResp,
      cancel_booking: () => ({ data: null, error: state.cancelError }),
    },
  }),
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn() }));

import {
  useCreateBooking,
  useUpdateBooking,
  useDeleteBooking,
  useCancelBooking,
} from "../useBookingMutations";

describe("useBookingMutations", () => {
  beforeEach(() => {
    state.createResp = { data: "new-id", error: null };
    state.updateResp = { data: { id: "b-1" }, error: null };
    state.deleteError = null;
    state.cancelError = null;
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
    state.createResp = {
      data: null,
      error: { code: "P0001", message: "forklift_unavailable" },
    } as never;
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
    state.deleteError = { code: "42501", message: "permission denied" };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useDeleteBooking(), { wrapper: Wrapper });
    result.current.mutate("b-1");
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("cancel: RPC error propagado", async () => {
    state.cancelError = { code: "P0001", message: "already cancelled" };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCancelBooking(), { wrapper: Wrapper });
    result.current.mutate("b-1");
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
