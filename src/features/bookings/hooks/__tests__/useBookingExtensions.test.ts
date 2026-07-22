import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

const h = vi.hoisted(() => {
  const state = {
    rpcResp: {
      data: "ext-1" as string | null,
      error: null as { code?: string; message: string } | null,
    },
    lastArgs: null as unknown,
  };
  const extendResolver = (args: unknown) => {
    state.lastArgs = args;
    return { data: state.rpcResp.data, error: state.rpcResp.error };
  };
  return { state, extendResolver };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    rpcResolvers: {
      extend_booking: h.extendResolver,
    },
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

import { useCreateBookingExtension } from "../bookingActions/useBookingExtensions";

describe("useCreateBookingExtension (RPC extend_booking)", () => {
  beforeEach(() => {
    h.state.rpcResp = { data: "ext-1", error: null };
    h.state.lastArgs = null;
  });

  it("happy path llama al RPC con los parámetros correctos", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateBookingExtension(), { wrapper: Wrapper });
    result.current.mutate({
      booking_id: "b-1",
      original_end_date: "2026-03-15",
      new_end_date: "2026-04-15",
      reason: "Cliente requiere ampliar",
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.state.lastArgs).toEqual({
      p_booking_id: "b-1",
      p_new_end_date: "2026-04-15",
      p_reason: "Cliente requiere ampliar",
    });
  });

  it("omite p_reason cuando no se provee", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateBookingExtension(), { wrapper: Wrapper });
    result.current.mutate({
      booking_id: "b-1",
      original_end_date: "2026-03-15",
      new_end_date: "2026-04-15",
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.state.lastArgs).toEqual({
      p_booking_id: "b-1",
      p_new_end_date: "2026-04-15",
    });
  });

  it("propaga error del RPC (buffer de mantenimiento o traslape)", async () => {
    h.state.rpcResp = {
      data: null,
      error: { code: "P0001", message: "La extensión invade la ventana de mantenimiento" },
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateBookingExtension(), { wrapper: Wrapper });
    result.current.mutate({
      booking_id: "b-1",
      original_end_date: "2026-03-15",
      new_end_date: "2026-04-15",
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toMatch(/mantenimiento/);
  });

  it("propaga error si el RPC rechaza por rol (Forbidden)", async () => {
    h.state.rpcResp = { data: null, error: { code: "42501", message: "Forbidden" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateBookingExtension(), { wrapper: Wrapper });
    result.current.mutate({
      booking_id: "b-1",
      original_end_date: "2026-03-15",
      new_end_date: "2026-04-15",
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toMatch(/Forbidden/);
  });
});
