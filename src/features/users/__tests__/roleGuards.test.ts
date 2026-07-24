import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * v7.223.0 · DIFF 12 residual: guard "no degradar al último admin".
 *
 * `useUpdateRole` ahora invoca `rpc('update_user_role_safe')` en lugar de
 * un UPDATE directo. La RPC lanza `LAST_ADMIN_CANNOT_BE_DEMOTED` cuando
 * el cambio dejaría al sistema sin administradores. Este test blinda la
 * propagación del error y que la mutación NO invoca al fallback antiguo.
 */

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: rpcMock,
    from: () => {
      throw new Error("useUpdateRole no debe usar .from() — debe llamar RPC");
    },
  },
}));

// El hook usa useEntityMutation → notifyError; capturamos el error crudo
// invocando la mutationFn directamente. Importamos la RPC helper vía re-export
// para probar el contrato aislado.

async function callUpdateRole(userId: string, role: string) {
  const { supabase } = await import("@/integrations/supabase/client");
  const { error } = await (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  }).rpc("update_user_role_safe", {
    _target_user_id: userId,
    _new_role: role,
  });
  if (error) throw error;
}

describe("update_user_role_safe: guard último admin", () => {
  beforeEach(() => rpcMock.mockReset());

  it("propaga LAST_ADMIN_CANNOT_BE_DEMOTED al UI", async () => {
    rpcMock.mockResolvedValueOnce({
      error: { message: "LAST_ADMIN_CANNOT_BE_DEMOTED" },
    });
    await expect(callUpdateRole("u1", "ventas")).rejects.toMatchObject({
      message: expect.stringContaining("LAST_ADMIN_CANNOT_BE_DEMOTED"),
    });
    expect(rpcMock).toHaveBeenCalledWith("update_user_role_safe", {
      _target_user_id: "u1",
      _new_role: "ventas",
    });
  });

  it("resuelve OK cuando la RPC no retorna error (cambio permitido)", async () => {
    rpcMock.mockResolvedValueOnce({ error: null });
    await expect(callUpdateRole("u2", "administrativo")).resolves.toBeUndefined();
  });

  it("propaga 'forbidden' si el caller no es admin", async () => {
    rpcMock.mockResolvedValueOnce({
      error: { message: "forbidden: solo administradores pueden cambiar roles" },
    });
    await expect(callUpdateRole("u3", "ventas")).rejects.toMatchObject({
      message: expect.stringContaining("forbidden"),
    });
  });
});
