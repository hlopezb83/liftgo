import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";
import type { AppRole } from "@/lib/domain/roles";

let currentRole: AppRole | null = "mechanic";
const rpcMock = vi.fn(() => Promise.resolve({
  data: { revenue: 100, maintenance_cost: 0 },
  error: null,
}));

// R8-FE-02 (BL-R8-06): get_forklift_financials solo debe invocarse para
// admin/administrativo/auditor/dispatcher. Otros roles (mechanic, ventas,
// customer) no deben ni disparar el RPC.
vi.mock("@/features/users", () => ({
  useUserRole: () => ({ data: currentRole, isLoading: false, isError: false }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    rpcResolvers: {
      get_forklift_financials: (...args: unknown[]) => {
        rpcMock(...args);
        return { data: { revenue: 100, maintenance_cost: 0 }, error: null };
      },
    },
  }),
}));

import { useForkliftFinancials } from "../useForkliftFinancials";

describe("useForkliftFinancials — gate por rol (R8-FE-02)", () => {
  beforeEach(() => {
    rpcMock.mockClear();
  });

  it("no llama al RPC cuando el rol es mechanic", async () => {
    currentRole = "mechanic";
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useForkliftFinancials("fork-1"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it("no llama al RPC cuando el rol es customer", async () => {
    currentRole = "customer";
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useForkliftFinancials("fork-1"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("sí llama al RPC cuando el rol es admin", async () => {
    currentRole = "admin";
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useForkliftFinancials("fork-1"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcMock).toHaveBeenCalled();
  });

  it("sí llama al RPC cuando el rol es dispatcher", async () => {
    currentRole = "dispatcher";
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useForkliftFinancials("fork-1"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcMock).toHaveBeenCalled();
  });
});
