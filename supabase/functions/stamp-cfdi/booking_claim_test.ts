// Real handler/auth/org code; injected transport only, no SQL, Auth backend or PAC.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSupabaseMock } from "../_shared/test/supabaseClientMock.ts";
import { handleStampCfdi } from "./handler.ts";

Deno.test("booking guard claim rejection stops before PAC without compensating writes", async () => {
  const invoiceId = "11111111-1111-4111-8111-111111111111";
  const userId = "22222222-2222-4222-8222-222222222222";
  const organizationId = "33333333-3333-4333-8333-333333333333";
  const caller = buildSupabaseMock({
    claims: { sub: userId, role: "authenticated" },
  });
  const service = buildSupabaseMock({
    selects: {
      profiles: { data: { is_active: true }, error: null },
      user_roles: { data: [{ role: "admin" }], error: null },
      organization_memberships: {
        data: [{ organization_id: organizationId, member_type: "internal" }],
        error: null,
      },
      invoices: {
        data: {
          id: invoiceId,
          organization_id: organizationId,
          status: "draft",
          cfdi_status: "pending",
          cfdi_uuid: null,
          facturapi_invoice_id: null,
          is_e2e: false,
        },
        error: null,
      },
    },
    updatesSeq: {
      invoices: [{
        data: null,
        error: {
          code: "23514",
          message: "Synthetic invoice_booking_not_cancelled",
        },
      }],
    },
  });
  let fetchCalls = 0;
  let fiscalConfigReads = 0;
  const response = await handleStampCfdi(
    new Request("http://localhost:8080/stamp-cfdi", {
      method: "POST",
      headers: {
        Authorization: "Bearer synthetic-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ invoice_id: invoiceId }),
    }),
    {
      createCallerClient: () => caller.client,
      createServiceClient: () => service.client,
      fetchImpl: () => {
        fetchCalls++;
        throw new Error("Network forbidden in offline test");
      },
      env: () => {
        fiscalConfigReads++;
        return undefined;
      },
    },
  );
  assertEquals(response.status, 409);
  assertEquals(await response.json(), {
    error: "Invoice already stamped or in progress",
  });
  assertEquals(fetchCalls, 0);
  assertEquals(fiscalConfigReads, 0);
  assertEquals(service.updates, [{
    table: "invoices",
    patch: { cfdi_status: "stamping" },
    filters: [
      { col: "id", val: invoiceId },
      { col: "cfdi_status", val: ["pending", "error"] },
      { col: "cfdi_uuid", val: null },
    ],
  }]);
  assertEquals(service.inserts, []);
  assertEquals(service.uploads, []);
  assertEquals(service.rpcCalls, []);
});
