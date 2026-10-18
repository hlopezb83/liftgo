import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRole } from "@/lib/domain/roles";
import type { ForkliftFinancials } from "../useForkliftFinancials";

const state = vi.hoisted(() => ({ role: "admin" as AppRole | null, rpc: vi.fn() }));
vi.mock("@/features/users", () => ({ useUserRole: () => ({ data: state.role }) }));
vi.mock("@/lib/rpc", () => ({ callRpc: state.rpc }));

import { useForkliftFinancials } from "../useForkliftFinancials";

const financials: ForkliftFinancials = {
  revenue: 100, maintenance_cost: 10, acquisition_cost: 1000, gross_margin: 90,
  roi_percent: 9, days_rented: 3, days_since_acquired: 10, utilization_percent: 30,
  hourometer_history: [],
};
const key = ["forklift-financials", "detail", "fork-1"] as const;

function setup() {
  // This client and identity are deliberately reused across each role change.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  const hook = renderHook(() => useForkliftFinancials("fork-1"), { wrapper: Wrapper });
  return { ...hook, queryClient };
}

beforeEach(() => {
  state.role = "admin";
  state.rpc.mockReset().mockResolvedValue(financials);
});
afterEach(cleanup);

describe("K2: financial access changes on the same QueryClient and identity", () => {
  it("hides the cached result immediately and purges every financial detail after admin -> mechanic", async () => {
    const { result, rerender, queryClient } = setup();
    await waitFor(() => expect(result.current.data).toEqual(financials));
    queryClient.setQueryData(["forklift-financials", "detail", "fork-2"], financials);
    queryClient.setQueryData(["forklifts", "detail", "fork-1"], { name: "Operational equipment" });

    state.role = "mechanic";
    rerender();

    expect(result.current.data).toBeUndefined();
    expect(queryClient.getQueryData(key)).toBeUndefined();
    expect(queryClient.getQueryData(["forklift-financials", "detail", "fork-2"])).toBeUndefined();
    expect(queryClient.getQueryData(["forklifts", "detail", "fork-1"])).toEqual({ name: "Operational equipment" });
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });

  it("does not restore data when an old request resolves after the role is revoked", async () => {
    let resolveLate!: (value: ForkliftFinancials) => void;
    const late = new Promise<ForkliftFinancials>((resolve) => { resolveLate = resolve; });
    // This mock intentionally ignores AbortSignal, like an already completed transport.
    state.rpc.mockReturnValue(late);
    const { result, rerender, queryClient } = setup();
    await waitFor(() => expect(state.rpc).toHaveBeenCalledTimes(1));

    state.role = "mechanic";
    rerender();
    await act(async () => { resolveLate(financials); await late; });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    expect(result.current.data).toBeUndefined();
    expect(queryClient.getQueryData(key)).toBeUndefined();
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });

  it("fails closed while the role is unresolved, then fetches fresh data after access is restored", async () => {
    const { result, rerender, queryClient } = setup();
    await waitFor(() => expect(result.current.data).toEqual(financials));

    state.role = null;
    rerender();
    expect(result.current.data).toBeUndefined();
    expect(queryClient.getQueryData(key)).toBeUndefined();

    const refreshed = { ...financials, revenue: 250 };
    state.rpc.mockResolvedValue(refreshed);
    state.role = "admin";
    rerender();
    await waitFor(() => expect(result.current.data).toEqual(refreshed));
    expect(state.rpc).toHaveBeenCalledTimes(2);
  });

  it("keeps the existing summary authorization independent of financial-cost permissions", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.data).toEqual(financials));
    for (const role of ["administrativo", "dispatcher", "auditor"] as const) {
      state.role = role;
      rerender();
      expect(result.current.data).toEqual(financials);
    }
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });
});
