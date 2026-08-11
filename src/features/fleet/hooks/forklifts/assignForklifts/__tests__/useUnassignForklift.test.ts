import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

const h = vi.hoisted(() => {
  const state = {
    rpcError: null as { code?: string; message: string } | null,
    rpcCalls: [] as { fn: string; args: unknown }[],
  };
  return { state };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    rpcResolvers: {
      unassign_forklift_from_sale_quote: (args) => {
        h.state.rpcCalls.push({ fn: "unassign_forklift_from_sale_quote", args });
        return { data: null, error: h.state.rpcError };
      },
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

import { useUnassignForklift } from "../useUnassignForklift";

describe("useUnassignForklift (FIX-R3-04)", () => {
  beforeEach(() => {
    h.state.rpcError = null;
    h.state.rpcCalls = [];
  });

  it("desasigna con una sola RPC transaccional", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUnassignForklift(), { wrapper: Wrapper });
    result.current.mutate({ assignmentId: "a-1", forkliftId: "f-1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.state.rpcCalls).toEqual([
      {
        fn: "unassign_forklift_from_sale_quote",
        args: { p_assignment_id: "a-1", p_forklift_id: "f-1" },
      },
    ]);
  });

  it("propaga el error de la RPC (asignación inexistente o unidad no vendida)", async () => {
    h.state.rpcError = { code: "P0001", message: "La asignación no existe" };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUnassignForklift(), { wrapper: Wrapper });
    result.current.mutate({ assignmentId: "a-x", forkliftId: "f-1" });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { message: string }).message).toMatch(/no existe/);
  });

  it("invalida las caches de flota, asignaciones y bitácora de estatus", async () => {
    const { Wrapper, queryClient } = createQueryWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUnassignForklift(), { wrapper: Wrapper });
    result.current.mutate({ assignmentId: "a-1", forkliftId: "f-1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys.some((k) => k?.includes("forklifts"))).toBe(true);
    expect(keys.some((k) => k?.includes("quote-assigned-forklifts") || k?.includes("quote_assigned_forklifts"))).toBe(true);
  });
});
