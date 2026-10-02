import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformCapability } from "@/lib/platformAccess.types";

const privilegedLoaded = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client.server", () => {
  privilegedLoaded();
  return { supabaseAdmin: { __privileged: true } };
});

// La base verifica asignación explícita y perfil activo en is_platform_operator.
// No se consultan rol empresarial, membresía ni estado de la empresa.
async function callGuard(data: unknown, error: { message: string } | null = null, capability?: PlatformCapability) {
  const { requirePlatformOperator } = await import("../adminGuards.server");
  const rpc = vi.fn(async () => ({ data, error }));
  const from = vi.fn(() => { throw new Error("No debe consultar una empresa"); });
  const caller = { rpc, from } as unknown as Parameters<typeof requirePlatformOperator>[0];
  return { result: requirePlatformOperator(caller, "operator-id", capability), rpc, from };
}

describe("requirePlatformOperator — autoridad global independiente", () => {
  beforeEach(() => {
    vi.resetModules();
    privilegedLoaded.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("permite al operador confirmado sin consultar rol, empresa o membresía", async () => {
    const { result, rpc, from } = await callGuard(true);
    await expect(result).resolves.toEqual({ userId: "operator-id", admin: { __privileged: true } });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("is_platform_operator");
    expect(from).not.toHaveBeenCalled();
    expect(privilegedLoaded).toHaveBeenCalledOnce();
  });

  it.each([false, null, undefined, "true", 1, {}, []])("rechaza %j sin cargar el cliente privilegiado", async (data) => {
    const { result } = await callGuard(data);
    await expect(result).rejects.toMatchObject({ status: 403 });
    expect(privilegedLoaded).not.toHaveBeenCalled();
  });

  it("un fallo del RPC devuelve 503 y nunca autoriza, incluso con true residual", async () => {
    const { result } = await callGuard(true, { message: "unavailable" });
    await expect(result).rejects.toMatchObject({ status: 503 });
    expect(privilegedLoaded).not.toHaveBeenCalled();
  });

  it("verifica la acción concreta antes de cargar el cliente privilegiado", async () => {
    const { result, rpc } = await callGuard(true, null, "catalogs.write");
    await expect(result).resolves.toMatchObject({ userId: "operator-id" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("has_platform_capability", { p_capability: "catalogs.write" });
  });

  it("ser operador sin esa acción no permite elevar al servicio", async () => {
    const { result } = await callGuard(false, null, "operators.manage");
    await expect(result).rejects.toMatchObject({ status: 403 });
    expect(privilegedLoaded).not.toHaveBeenCalled();
  });
});
