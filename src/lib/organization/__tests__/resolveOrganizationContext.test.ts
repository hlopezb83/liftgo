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
  accounts?: Row[];
  accountError?: boolean;
}

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
    expect(calls.every((c) => c.table === "organization_memberships")).toBe(true);
    expect(calls[0]).toEqual({
      table: "organization_memberships",
      column: "auth_user_id",
      value: USER,
    });
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
    const { client } = makeClient({
      memberships: [
        { organization_id: ORG_A, member_type: "internal" },
        { organization_id: ORG_B, member_type: "internal" },
      ],
    });
    await expect(resolveOrganizationContext(client, USER)).resolves.toEqual({
      status: "no_membership",
      reason: "ambiguous_membership",
    });
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
      accountError: true,
    });
    await expect(resolveOrganizationContext(client, USER)).rejects.toMatchObject({
      code: "portal_account_read_error",
    });
  });
});
