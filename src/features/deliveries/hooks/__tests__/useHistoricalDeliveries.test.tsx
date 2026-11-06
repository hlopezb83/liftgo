import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

const state = vi.hoisted(() => ({ error: null as null | { message: string }, select: "" }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ tableResolvers: { deliveries: (calls) => {
    state.select = String(calls.find((c) => c.method === "select")?.args[0]);
    return { data: [], error: state.error };
  } } }),
}));
import { useDeliveries } from "../useDeliveries";

describe("historical deliveries query", () => {
  it("loads logistics and historical ledger in one RLS-scoped request", async () => {
    state.error = null;
    const { result } = renderHook(() => useDeliveries(), { wrapper: createQueryWrapper().Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(state.select).toContain("historical_reconciliation:delivery_historical_reconciliations");
  });
  it("fails visibly if ledger cannot be loaded, rather than inventing pending state", async () => {
    state.error = { message: "Historical ledger unavailable" };
    const { result } = renderHook(() => useDeliveries(), { wrapper: createQueryWrapper().Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(state.error);
  });
});
