/**
 * Tramo 9 multiempresa: guard de operador de plataforma.
 *
 * Sin red: el cliente del usuario se sustituye por un doble que responde a
 * `is_active_user`, `has_role`, `is_platform_operator` y a las lecturas de
 * membresía/empresa. El cliente privilegiado se sustituye por un objeto vacío
 * y sólo debe cargarse después de aprobar el guard.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { __privileged: true },
}));

import { HttpError, requirePlatformOperator } from "../adminGuards.server";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";

type Rows = Record<string, unknown>[];
interface RpcResponses {
  is_active_user?: boolean;
  has_role?: boolean;
  is_platform_operator?: unknown;
  is_platform_operator_error?: { message: string };
}
interface TableRows {
  organization_memberships?: Rows;
  organizations?: Rows;
  customer_portal_accounts?: Rows;
}

function makeCaller(rpc: RpcResponses, tables: TableRows = {}) {
  const calls: string[] = [];
  const all: Required<TableRows> = {
    organization_memberships: tables.organization_memberships ?? [
      { organization_id: ORG_A, member_type: "internal" },
    ],
    organizations: tables.organizations ?? [{ id: ORG_A, is_active: true }],
    customer_portal_accounts: tables.customer_portal_accounts ?? [],
  };
  const client = {
    rpc: (fn: string) => {
      calls.push(fn);
      if (fn === "is_active_user") {
        return Promise.resolve({ data: rpc.is_active_user ?? true, error: null });
      }
      if (fn === "has_role") return Promise.resolve({ data: rpc.has_role ?? true, error: null });
      if (fn === "is_platform_operator") {
        return Promise.resolve({
          data: rpc.is_platform_operator ?? null,
          error: rpc.is_platform_operator_error ?? null,
        });
      }
      return Promise.resolve({ data: null, error: { message: `rpc inesperado: ${fn}` } });
    },
    from: (table: keyof TableRows) => ({
      select: () => ({
        eq: (_column: string, value: unknown) => ({
          limit: () => {
            const rows = all[table];
            const filtered =
              table === "organizations" ? rows.filter((row) => row["id"] === value) : rows;
            return Promise.resolve({ data: filtered, error: null });
          },
        }),
      }),
    }),
  };
  return { client: client as unknown as Parameters<typeof requirePlatformOperator>[0], calls };
}

async function expectHttpError(promise: Promise<unknown>, status: number): Promise<void> {
  try {
    await promise;
    throw new Error("no lanzó");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(status);
  }
}

describe("requirePlatformOperator", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("acepta a un administrador interno confirmado como operador por la base", async () => {
    const { client, calls } = makeCaller({ is_platform_operator: true });
    const result = await requirePlatformOperator(client, USER);
    expect(result.organizationId).toBe(ORG_A);
    expect(result.role).toBe("admin");
    expect(result.admin).toEqual({ __privileged: true });
    // El RPC de operador se consulta con el cliente del propio usuario.
    expect(calls).toContain("is_platform_operator");
  });

  it("rechaza al administrador que NO es operador (403)", async () => {
    const { client } = makeCaller({ is_platform_operator: false });
    await expectHttpError(requirePlatformOperator(client, USER), 403);
  });

  it("fail-closed: un dato distinto de `true` nunca autoriza", async () => {
    const { client } = makeCaller({ is_platform_operator: "true" });
    await expectHttpError(requirePlatformOperator(client, USER), 403);
  });

  it("fail-closed: error del RPC de operador responde 503, no 200", async () => {
    const { client } = makeCaller({ is_platform_operator_error: { message: "boom" } });
    await expectHttpError(requirePlatformOperator(client, USER), 503);
  });

  it("rechaza a quien no es admin antes de consultar al operador", async () => {
    const { client, calls } = makeCaller({ has_role: false, is_platform_operator: true });
    await expectHttpError(requirePlatformOperator(client, USER), 403);
    expect(calls).not.toContain("is_platform_operator");
  });

  it("rechaza la cuenta desactivada aunque fuera operador", async () => {
    const { client } = makeCaller({ is_active_user: false, is_platform_operator: true });
    await expectHttpError(requirePlatformOperator(client, USER), 403);
  });

  it("rechaza al operador cuya propia empresa está suspendida", async () => {
    const { client } = makeCaller(
      { is_platform_operator: true },
      { organizations: [{ id: ORG_A, is_active: false }] },
    );
    await expectHttpError(requirePlatformOperator(client, USER), 403);
  });

  it("rechaza a una cuenta de portal aunque tuviera rol admin residual", async () => {
    const { client } = makeCaller(
      { is_platform_operator: true },
      {
        organization_memberships: [{ organization_id: ORG_A, member_type: "portal" }],
        customer_portal_accounts: [{ organization_id: ORG_A, customer_id: USER, status: "active" }],
      },
    );
    await expectHttpError(requirePlatformOperator(client, USER), 403);
  });
});
