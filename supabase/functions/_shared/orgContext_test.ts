import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertDocumentOrganization,
  groupByOrganization,
  ORG_DOCUMENT_MISMATCH,
  resolveCallerOrganization,
  resolveDocumentOrganization,
} from "./orgContext.ts";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";

/** Mock mínimo de `admin.from("organization_memberships")...limit(2)`. */
function membershipClient(
  result: { data?: unknown; error?: unknown },
): { from: (t: string) => unknown } {
  const builder = {
    select: () => builder,
    eq: () => builder,
    limit: () => Promise.resolve(result),
  };
  return { from: () => builder };
}

Deno.test("resolveCallerOrganization devuelve la organización de la membresía interna", async () => {
  const res = await resolveCallerOrganization(
    // deno-lint-ignore no-explicit-any
    membershipClient({ data: [{ organization_id: ORG_A }] }) as any,
    "user-1",
  );
  assert(res.ok);
  assertEquals(res.organizationId, ORG_A);
});

Deno.test("resolveCallerOrganization rechaza sin membresía (403)", async () => {
  const res = await resolveCallerOrganization(
    // deno-lint-ignore no-explicit-any
    membershipClient({ data: [] }) as any,
    "user-1",
  );
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.status, 403);
});

Deno.test("resolveCallerOrganization es fail-closed ante error de consulta (503)", async () => {
  const res = await resolveCallerOrganization(
    // deno-lint-ignore no-explicit-any
    membershipClient({ error: { message: "boom" } }) as any,
    "user-1",
  );
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.status, 503);
});

Deno.test("assertDocumentOrganization rechaza documento de otra empresa", () => {
  const res = assertDocumentOrganization({
    callerOrganizationId: ORG_A,
    documentOrganizationId: ORG_B,
  });
  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.status, 403);
    assertEquals(res.message, ORG_DOCUMENT_MISMATCH);
  }
});

Deno.test("assertDocumentOrganization rechaza documento sin empresa", () => {
  const res = assertDocumentOrganization({
    callerOrganizationId: ORG_A,
    documentOrganizationId: null,
  });
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.status, 409);
});

Deno.test("service_role hereda la organización del documento, no la del usuario", async () => {
  const res = await resolveDocumentOrganization({
    // deno-lint-ignore no-explicit-any
    admin: membershipClient({ data: [{ organization_id: ORG_A }] }) as any,
    userId: "",
    isServiceRole: true,
    documentOrganizationId: ORG_B,
  });
  assert(res.ok);
  assertEquals(res.organizationId, ORG_B);
  assertEquals(res.callerOrganizationId, null);
});

Deno.test("flujo normal de una sola empresa sigue funcionando", async () => {
  const res = await resolveDocumentOrganization({
    // deno-lint-ignore no-explicit-any
    admin: membershipClient({ data: [{ organization_id: ORG_A }] }) as any,
    userId: "user-1",
    isServiceRole: false,
    documentOrganizationId: ORG_A,
  });
  assert(res.ok);
  assertEquals(res.organizationId, ORG_A);
});

Deno.test("groupByOrganization separa por empresa y aparta las huérfanas", () => {
  const { groups, withoutOrganization } = groupByOrganization([
    { id: 1, organization_id: ORG_A },
    { id: 2, organization_id: ORG_B },
    { id: 3, organization_id: ORG_A },
    { id: 4, organization_id: null },
  ]);
  assertEquals(groups.size, 2);
  assertEquals(groups.get(ORG_A)?.length, 2);
  assertEquals(groups.get(ORG_B)?.length, 1);
  assertEquals(withoutOrganization.length, 1);
});
