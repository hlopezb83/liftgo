/**
 * Tramo 5 multiempresa: alcance de la administración interna.
 * Sin red: el cliente Supabase se sustituye por un doble mínimo.
 */
import { describe, expect, it } from "vitest";
import {
  resolveInternalScope,
  resolveTargetScope,
  type AdminScopeClient,
} from "../adminScope";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

type Rows = Record<string, unknown>[];
interface TableResult {
  data?: Rows;
  error?: { message: string };
}

/**
 * Tramo 9: el resolver verifica `organizations.is_active` (fail-closed) antes
 * de aceptar cualquier membresía. El doble expone ambas empresas activas salvo
 * que la prueba lo sobrescriba.
 */
const ACTIVE_ORGS: TableResult = {
  data: [
    { id: ORG_A, is_active: true },
    { id: ORG_B, is_active: true },
  ],
};

function client(tables: Record<string, TableResult>): AdminScopeClient {
  const all: Record<string, TableResult> = { organizations: ACTIVE_ORGS, ...tables };
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, value: unknown) => ({
          limit: () => {
            const rows = all[table]?.data ?? [];
            const filtered =
              table === "organizations" ? rows.filter((row) => row["id"] === value) : rows;
            return Promise.resolve({ data: filtered, error: all[table]?.error ?? null });
          },
        }),
      }),
    }),
  } as unknown as AdminScopeClient;
}

describe("resolveInternalScope", () => {
  it("devuelve la empresa del personal interno verificado", async () => {
    const scope = await resolveInternalScope(
      client({
        organization_memberships: {
          data: [{ organization_id: ORG_A, member_type: "internal" }],
        },
      }),
      USER,
    );
    expect(scope).toEqual({ status: "ready", organizationId: ORG_A });
  });

  it("rechaza una cuenta de portal: nunca alcanza la administración", async () => {
    const scope = await resolveInternalScope(
      client({
        organization_memberships: {
          data: [{ organization_id: ORG_A, member_type: "portal" }],
        },
        customer_portal_accounts: {
          data: [{ organization_id: ORG_A, customer_id: USER, status: "active" }],
        },
      }),
      USER,
    );
    expect(scope).toEqual({ status: "not_internal", reason: "portal_account" });
  });

  it("rechaza al usuario sin membresía", async () => {
    const scope = await resolveInternalScope(
      client({ organization_memberships: { data: [] } }),
      USER,
    );
    expect(scope).toEqual({ status: "not_internal", reason: "no_membership" });
  });

  it("distingue el error de lectura de la ausencia de datos", async () => {
    const scope = await resolveInternalScope(
      client({ organization_memberships: { error: { message: "boom" } } }),
      USER,
    );
    expect(scope).toEqual({ status: "read_error" });
  });

  it("tramo 9: una empresa suspendida deja fuera a su personal interno", async () => {
    const scope = await resolveInternalScope(
      client({
        organization_memberships: {
          data: [{ organization_id: ORG_A, member_type: "internal" }],
        },
        organizations: { data: [{ id: ORG_A, is_active: false }] },
      }),
      USER,
    );
    expect(scope).toEqual({ status: "not_internal", reason: "no_membership" });
  });
});

describe("resolveTargetScope", () => {
  it("acepta al usuario de la misma empresa", async () => {
    const target = await resolveTargetScope(
      client({ organization_memberships: { data: [{ organization_id: ORG_A }] } }),
      USER,
      ORG_A,
    );
    expect(target).toEqual({ status: "in_organization" });
  });

  it("trata al usuario de otra empresa como inexistente", async () => {
    const target = await resolveTargetScope(
      client({ organization_memberships: { data: [{ organization_id: ORG_B }] } }),
      USER,
      ORG_A,
    );
    expect(target).toEqual({ status: "not_found" });
  });

  it("trata la membresía ambigua como inexistente", async () => {
    const target = await resolveTargetScope(
      client({
        organization_memberships: {
          data: [{ organization_id: ORG_A }, { organization_id: ORG_B }],
        },
      }),
      USER,
      ORG_A,
    );
    expect(target).toEqual({ status: "not_found" });
  });

  it("no degrada un error de lectura a 'no encontrado'", async () => {
    const target = await resolveTargetScope(
      client({ organization_memberships: { error: { message: "boom" } } }),
      USER,
      ORG_A,
    );
    expect(target).toEqual({ status: "read_error" });
  });
});
