/**
 * La fachada `adminGuards.server.ts` debe exportar exactamente la API previa
 * y los guards deben seguir fallando cerrado ante errores de lectura.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { __privileged: true },
}));

import * as guards from "../adminGuards.server";

const USER = "33333333-3333-4333-8333-333333333333";

const API_PREVIA = [
  "HttpError",
  "asUntypedRpc",
  "assertTargetInOrganization",
  "createInternalMembership",
  "enforceRateLimit",
  "generateSecurePassword",
  "isEmail",
  "isNonEmptyString",
  "isUUID",
  "isValidRole",
  "requireAdmin",
  "requireInternalOrganization",
  "requirePlatformOperator",
  "requireRole",
];

type RpcFn = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const clienteConRpc = (rpc: RpcFn) =>
  ({ rpc }) as unknown as guards.CallerClient;

describe("fachada de guards administrativos", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("exporta exactamente los símbolos de la API previa", () => {
    expect(Object.keys(guards).sort()).toEqual(API_PREVIA);
  });

  it("requireRole falla cerrado si is_active_user devuelve error", async () => {
    const caller = clienteConRpc(async () => ({
      data: null,
      error: { message: "boom" },
    }));
    await expect(guards.requireRole(caller, USER, ["admin"])).rejects.toThrow(
      guards.HttpError,
    );
  });

  it("requireRole rechaza una cuenta desactivada", async () => {
    const caller = clienteConRpc(async (fn) => ({
      data: fn === "is_active_user" ? false : true,
      error: null,
    }));
    await expect(guards.requireRole(caller, USER, ["admin"])).rejects.toMatchObject(
      { status: 403, message: "Cuenta desactivada" },
    );
  });

  it("requireRole falla cerrado si has_role devuelve error", async () => {
    const caller = clienteConRpc(async (fn) =>
      fn === "is_active_user"
        ? { data: true, error: null }
        : { data: null, error: { message: "sin servicio" } },
    );
    await expect(guards.requireRole(caller, USER, ["admin"])).rejects.toMatchObject(
      { status: 503 },
    );
  });

  it("requireAdmin aprueba y sólo entonces carga el cliente privilegiado", async () => {
    const caller = clienteConRpc(async () => ({ data: true, error: null }));
    const autorizado = await guards.requireAdmin(caller, USER);
    expect(autorizado).toMatchObject({ userId: USER, role: "admin" });
    expect(autorizado.admin).toMatchObject({ __privileged: true });
  });

  it("enforceRateLimit falla cerrado ante error del RPC y rechaza al superar el límite", async () => {
    const conError = clienteConRpc(async () => ({
      data: null,
      error: { message: "rpc caído" },
    })) as unknown as guards.AdminClient;
    await expect(
      guards.enforceRateLimit(conError, "b", USER),
    ).rejects.toMatchObject({ status: 503 });

    const excedido = clienteConRpc(async () => ({
      data: false,
      error: null,
    })) as unknown as guards.AdminClient;
    await expect(
      guards.enforceRateLimit(excedido, "b", USER),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("requireInternalOrganization falla cerrado si no hay membresía interna", async () => {
    const sinMembresia = {
      rpc: async () => ({ data: true, error: null }),
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            limit: async () => ({ data: [], error: null }),
            order: () => ({ limit: async () => ({ data: [], error: null }) }),
          }),
        }),
      }),
    } as unknown as guards.CallerClient;
    await expect(
      guards.requireInternalOrganization(sinMembresia, USER),
    ).rejects.toMatchObject({ status: 403 });
  });
});
