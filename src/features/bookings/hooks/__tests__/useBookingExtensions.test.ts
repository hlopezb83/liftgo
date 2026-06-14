import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  createSupabaseChainMock,
  type ChainResolver,
} from "@/test/helpers/supabaseChain";
import { createQueryWrapper } from "@/test/helpers/queryClient";

const state = {
  bookingUpdate: { data: [{ id: "b-1" }] as { id: string }[] | null, error: null as { code?: string; message: string } | null },
  insertResp: { data: { id: "ext-1", booking_id: "b-1" }, error: null as { code?: string; message: string } | null },
};

const bookingsResolver: ChainResolver = (calls) => {
  if (calls.some((c) => c.method === "update")) {
    return { data: state.bookingUpdate.data, error: state.bookingUpdate.error };
  }
  return { data: [], error: null };
};
const extResolver: ChainResolver = (calls) => {
  if (calls.some((c) => c.method === "insert")) {
    return { data: state.insertResp.data, error: state.insertResp.error };
  }
  return { data: [], error: null };
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      bookings: bookingsResolver,
      booking_extensions: extResolver,
    },
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn() }));

import { useCreateBookingExtension } from "../useBookingExtensions";

describe("useCreateBookingExtension", () => {
  beforeEach(() => {
    state.bookingUpdate = { data: [{ id: "b-1" }], error: null };
    state.insertResp = { data: { id: "ext-1", booking_id: "b-1" }, error: null };
  });

  it("happy path", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateBookingExtension(), { wrapper: Wrapper });
    result.current.mutate({
      booking_id: "b-1",
      original_end_date: "2026-03-15",
      new_end_date: "2026-04-15",
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("falla si el update no afecta filas (RLS oculta la reserva)", async () => {
    state.bookingUpdate = { data: [], error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateBookingExtension(), { wrapper: Wrapper });
    result.current.mutate({
      booking_id: "b-1",
      original_end_date: "2026-03-15",
      new_end_date: "2026-04-15",
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toMatch(/no se modificó/);
  });

  it("propaga error del insert en booking_extensions", async () => {
    state.insertResp = { data: null, error: { code: "23514", message: "check_violation" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateBookingExtension(), { wrapper: Wrapper });
    result.current.mutate({
      booking_id: "b-1",
      original_end_date: "2026-03-15",
      new_end_date: "2026-04-15",
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
