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
      assign_forklift_to_sale_quote: (args) => {
        h.state.rpcCalls.push({ fn: "assign_forklift_to_sale_quote", args });
        return { data: null, error: h.state.rpcError };
      },
    },
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

import { useAssignForklift } from "../useAssignForklift";

describe("useAssignForklift", () => {
  beforeEach(() => {
    h.state.rpcError = null;
    h.state.rpcCalls = [];
  });

  it("happy path: una sola llamada RPC con arrays paralelos", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAssignForklift(), { wrapper: Wrapper });
    result.current.mutate([{ quoteId: "q-1", forkliftId: "f-1", lineIndex: 0 }]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.state.rpcCalls).toEqual([
      {
        fn: "assign_forklift_to_sale_quote",
        args: { p_quote_id: "q-1", p_forklift_ids: ["f-1"], p_line_indices: [0] },
      },
    ]);
  });

  it("agrupa por cotización: una llamada RPC por quoteId", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAssignForklift(), { wrapper: Wrapper });
    result.current.mutate([
      { quoteId: "q-1", forkliftId: "f-1", lineIndex: 0 },
      { quoteId: "q-1", forkliftId: "f-2", lineIndex: 1 },
      { quoteId: "q-2", forkliftId: "f-3", lineIndex: 0 },
    ]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.state.rpcCalls).toHaveLength(2);
    expect(h.state.rpcCalls[0].args).toEqual({
      p_quote_id: "q-1", p_forklift_ids: ["f-1", "f-2"], p_line_indices: [0, 1],
    });
    expect(h.state.rpcCalls[1].args).toEqual({
      p_quote_id: "q-2", p_forklift_ids: ["f-3"], p_line_indices: [0],
    });
  });

  it("propaga el error de la RPC (sold / archivado / renta activa)", async () => {
    h.state.rpcError = { code: "check_violation", message: "El montacargas tiene una renta activa" };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAssignForklift(), { wrapper: Wrapper });
    result.current.mutate([{ quoteId: "q-1", forkliftId: "f-1", lineIndex: 0 }]);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { message: string }).message).toMatch(/renta activa/);
  });
});
