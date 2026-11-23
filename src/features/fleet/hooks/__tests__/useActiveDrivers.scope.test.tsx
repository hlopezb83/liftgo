import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { useActiveDrivers } from "../useDrivers";

const state = vi.hoisted(() => ({
  identity: "user:org-a:internal" as string | null,
  fetch: vi.fn(),
  activeFilter: vi.fn(),
  abortSignal: vi.fn(),
}));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => state.identity }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (column: string, value: boolean) => {
          state.activeFilter(column, value);
          return {
            order: () => ({
              abortSignal: (signal: AbortSignal) => {
                state.abortSignal(signal);
                return { returns: () => state.fetch() };
              },
            }),
          };
        },
      }),
    }),
  },
}));
vi.mock("@/lib/hooks/useEntityMutation", () => ({ useEntityMutation: vi.fn() }));

describe("conductores activos por identidad", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.identity = "user:org-a:internal";
    state.fetch.mockReset();
  });

  it("conserva la lista tras un refetch fallido solo para la misma identidad verificada", async () => {
    const driver = { id: "driver-a", name: "Conductora de empresa A" };
    const unavailable = { data: null, error: { message: "Servicio temporalmente no disponible" }, status: 503 };
    state.fetch.mockResolvedValueOnce({ data: [driver], error: null, status: 200 }).mockResolvedValue(unavailable);
    const { Wrapper } = createQueryWrapper();
    const { result, rerender } = renderHook(() => {
      const { data, error, isRefetchError, isLoadingError, refetch } = useActiveDrivers();
      return { data, error, isRefetchError, isLoadingError, refetch };
    }, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual([driver]));
    expect(state.activeFilter).toHaveBeenCalledWith("is_active", true);
    expect(state.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));

    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.isRefetchError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 503 });
    expect(result.current.data).toEqual([driver]);

    state.identity = "user:org-b:internal";
    rerender();
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.isLoadingError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isRefetchError).toBe(false);
  });

  it("no lee conductores cuando la identidad no está verificada", () => {
    state.identity = null;
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useActiveDrivers(), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(state.fetch).not.toHaveBeenCalled();
  });
});
