import { describe, expect, it } from "vitest";
import {
  OrganizationContextError,
  resolveOrganizationContext,
  type OrganizationContextClient,
} from "../resolveOrganizationContext";

const ORG_A = "0a000000-0000-4000-8000-00000000000a";
const ORG_B = "0b000000-0000-4000-8000-00000000000b";
const CUSTOMER = "c0000000-0000-4000-8000-00000000000c";
const USER = "u0000000-0000-4000-8000-000000000001";

type Row = Record<string, unknown>;
interface Fixture {
  memberships?: Row[];
  membershipError?: boolean;
  /** Filas visibles de `organizations`; por defecto A y B activas. */
  organizations?: Row[];
  organizationError?: boolean;
  accounts?: Row[];
  accountError?: boolean;
}

const ACTIVE_ORGS: Row[] = [
  { id: ORG_A, is_active: true },
  { id: ORG_B, is_active: true },
];

function makeClient(fixture: Fixture) {
  const calls: { table: string; column: string; value: string }[] = [];
  const client: OrganizationContextClient = {
    from(table) {
      return {
        select() {
          return {
            eq(column, value) {
              calls.push({ table, column, value });
              return {
                limit() {
                  if (table === "organization_memberships") {
                    return Promise.resolve({
                      data: fixture.membershipError ? null : (fixture.memberships ?? []),
                      error: fixture.membershipError ? { message: "boom" } : null,
                    });
                  }
                  if (table === "organizations") {
                    const rows = (fixture.organizations ?? ACTIVE_ORGS).filter(
                      (row) => row["id"] === value,
                    );
                    return Promise.resolve({
                      data: fixture.organizationError ? null : rows,
                      error: fixture.organizationError ? { message: "boom" } : null,
                    });
                  }
                  return Promise.resolve({
                    data: fixture.accountError ? null : (fixture.accounts ?? []),
                    error: fixture.accountError ? { message: "boom" } : null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

describe("resolveOrganizationContext", () => {
  it("usuario interno: resuelve su organización y no consulta cuentas de portal", async () => {
    const { client, calls } = makeClient({
      memberships: [{ organization_id: ORG_A, member_type: "internal" }],
    });
    const result = await resolveOrganizationContext(client, USER);
    expect(result).toEqual({
      status: "ready",
      organizationId: ORG_A,
      memberType: "internal",
      customerId: null,
    });
    expect(calls.some((c) => c.table === "customer_portal_accounts")).toBe(false);
    expect(calls[0]).toEqual({
      table: "organization_memberships",
      column: "auth_user_id",
      value: USER,
    });
    // La empresa se verifica por su id, con el cliente del propio usuario.
    expect(calls).toContainEqual({ table: "organizations", column: "id", value: ORG_A });
  });

  it("portal: exige cuenta activa coherente con la organización de la membresía", async () => {
    const { client } = makeClient({
      memberships: [{ organization_id: ORG_A, member_type: "portal" }],
      accounts: [{ organization_id: ORG_A, customer_id: CUSTOMER, status: "active" }],
    });
    await expect(resolveOrganizationContext(client, USER)).resolves.toEqual({
      status: "ready",
      organizationId: ORG_A,
      memberType: "portal",
      customerId: CUSTOMER,
    });
  });

  it.each(["suspended", "revoked"])(
    "portal con cuenta %s: sin acceso y sin cliente",
    async (status) => {
      const { client } = makeClient({
        memberships: [{ organization_id: ORG_A, member_type: "portal" }],
        accounts: [{ organization_id: ORG_A, customer_id: CUSTOMER, status }],
      });
      await expect(resolveOrganizationContext(client, USER)).resolves.toEqual({
        status: "no_membership",
        reason: "portal_account_inactive",
      });
    },
  );

  it("portal cuya cuenta pertenece a otra organización: rechazado", async () => {
    const { client } = makeClient({
      memberships: [{ organization_id: ORG_A, member_type: "portal" }],
      accounts: [{ organization_id: ORG_B, customer_id: CUSTOMER, status: "active" }],
    });
    await expect(resolveOrganizationContext(client, USER)).resolves.toEqual({
      status: "no_membership",
      reason: "portal_organization_mismatch",
    });
  });

  it("portal sin cuenta registrada: rechazado", async () => {
    const { client } = makeClient({
      memberships: [{ organization_id: ORG_A, member_type: "portal" }],
      accounts: [],
    });
    await expect(resolveOrganizationContext(client, USER)).resolves.toEqual({
      status: "no_membership",
      reason: "portal_account_missing",
    });
  });

  it("sin membresía: estado explícito", async () => {
    const { client } = makeClient({ memberships: [] });
    await expect(resolveOrganizationContext(client, USER)).resolves.toEqual({
      status: "no_membership",
      reason: "no_membership",
    });
  });

  it("membresía ambigua: estado explícito, nunca se elige una organización", async () => {
    const { client, calls } = makeClient({
      memberships: [
        { organization_id: ORG_A, member_type: "internal" },
        { organization_id: ORG_B, member_type: "internal" },
      ],
    });
    await expect(resolveOrganizationContext(client, USER)).resolves.toEqual({
      status: "no_membership",
      reason: "ambiguous_membership",
    });
    expect(calls.some((c) => c.table === "organizations")).toBe(false);
  });

  it("error de lectura de membresías: error de verificación, no 'sin membresía'", async () => {
    const { client } = makeClient({ membershipError: true });
    await expect(resolveOrganizationContext(client, USER)).rejects.toBeInstanceOf(
      OrganizationContextError,
    );
  });

  it("error de lectura de la cuenta de portal: error de verificación", async () => {
    const { client } = makeClient({
      memberships: [{ organization_id: ORG_A, member_type: "portal" }],
      accounts: [{ organization_id: ORG_A, customer_id: CUSTOMER, status: "active" }],
      accountError: true,
    });
    await expect(resolveOrganizationContext(client, USER)).rejects.toMatchObject({
      code: "portal_account_read_error",
    });
  });

  describe("tramo 9: empresa suspendida", () => {
    it("interno de una empresa suspendida: organization_inactive, nunca ready", async () => {
      const { client } = makeClient({
        memberships: [{ organization_id: ORG_B, member_type: "internal" }],
        organizations: [{ id: ORG_A, is_active: true }, { id: ORG_B, is_active: false }],
      });
      await expect(resolveOrganizationContext(client, USER)).resolves.toEqual({
        status: "no_membership",
        reason: "organization_inactive",
      });
    });

    it("portal de una empresa suspendida: se niega antes de leer la cuenta del portal", async () => {
      const { client, calls } = makeClient({
        memberships: [{ organization_id: ORG_B, member_type: "portal" }],
        organizations: [{ id: ORG_B, is_active: false }],
        accounts: [{ organization_id: ORG_B, customer_id: CUSTOMER, status: "active" }],
      });
      await expect(resolveOrganizationContext(client, USER)).resolves.toEqual({
        status: "no_membership",
        reason: "organization_inactive",
      });
      expect(calls.some((c) => c.table === "customer_portal_accounts")).toBe(false);
    });

    it("empresa no visible para el usuario: fail-closed como inactiva", async () => {
      const { client } = makeClient({
        memberships: [{ organization_id: ORG_B, member_type: "internal" }],
        organizations: [{ id: ORG_A, is_active: true }],
      });
      await expect(resolveOrganizationContext(client, USER)).resolves.toEqual({
        status: "no_membership",
        reason: "organization_inactive",
      });
    });

    it("error de lectura de la empresa: error de verificación, no 'sin membresía'", async () => {
      const { client } = makeClient({
        memberships: [{ organization_id: ORG_A, member_type: "internal" }],
        organizationError: true,
      });
      await expect(resolveOrganizationContext(client, USER)).rejects.toMatchObject({
        code: "organization_read_error",
      });
    });
  });
});
