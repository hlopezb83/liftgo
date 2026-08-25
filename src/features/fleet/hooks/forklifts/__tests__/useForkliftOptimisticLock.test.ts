import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock, type ChainCall } from "@/test/helpers/supabaseChain";

/**
 * M-11b: bloqueo optimista en `useUpdateForklift`.
 * Riesgo: dos usuarios editando el mismo montacargas → el último pisa los
 * cambios del primero (lost update) sin ningún aviso.
 */

vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(), notifySuccess: vi.fn(), notifyInfo: vi.fn(),
  notifyWarning: vi.fn(), notifyValidation: vi.fn(), notifyAsync: vi.fn(),
}));

const updateCalls: ChainCall[][] = [];
/** Fila que devuelve el UPDATE (null = 0 filas afectadas → posible conflicto). */
let updateRow: unknown = { id: "f-1" };
/** Fila que devuelve el SELECT de verificación (existe = conflicto real). */
let stillExistsRow: unknown = { id: "f-1" };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      forklifts: (calls) => {
        if (calls.some((c) => c.method === "update")) {
          updateCalls.push([...calls]);
          return { data: updateRow, error: null };
        }
        return { data: stillExistsRow, error: null };
      },
    },
  }),
}));

const { useUpdateForklift } = await import("../useForkliftMutations");

beforeEach(() => {
  updateCalls.length = 0;
  updateRow = { id: "f-1" };
  stillExistsRow = { id: "f-1" };
});

describe("useUpdateForklift — bloqueo optimista (M-11b)", () => {
  it("filtra por updated_at esperado y por deleted_at IS NULL", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUpdateForklift(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: "f-1", name: "MC-01", expectedUpdatedAt: "2026-01-01T00:00:00Z",
      } as never);
    });

    const calls = updateCalls[0];
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "updated_at" && c.args[1] === "2026-01-01T00:00:00Z")).toBe(true);
    expect(calls.some((c) => c.method === "is" && c.args[0] === "deleted_at")).toBe(true);
  });

  it("lanza stale_write cuando 0 filas pero el registro sigue vivo", async () => {
    updateRow = null;
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUpdateForklift(), { wrapper: Wrapper });

    let err: unknown;
    await act(async () => {
      await result.current
        .mutateAsync({ id: "f-1", name: "x", expectedUpdatedAt: "2026-01-01T00:00:00Z" } as never)
        .catch((e) => { err = e; });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(String((err as Error)?.message)).toMatch(/stale_write/);
  });

  it("sin expectedUpdatedAt no agrega el filtro de versión", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUpdateForklift(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "f-1", name: "MC-01" } as never);
    });

    expect(updateCalls[0].some((c) => c.method === "eq" && c.args[0] === "updated_at")).toBe(false);
  });
});
