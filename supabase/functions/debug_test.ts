import { handleStampCreditNote } from "./stamp-credit-note/handler.ts";
import { buildSupabaseMock } from "./_shared/test/supabaseClientMock.ts";
import {
  facturapiOk,
  installFacturapiMock,
  pdfResponse,
  xmlResponse,
} from "./_shared/test/facturapiMock.ts";

const NC_ID = "11111111-1111-4111-8111-111111111111";
const INVOICE_ID = "33333333-3333-4333-8333-333333333333";
const STAMPED_INVOICE = {
  id: INVOICE_ID,
  cfdi_status: "stamped",
  facturapi_invoice_id: "fapi_source",
  receptor_rfc: "XAXX010101000",
  cfdi_uuid: "abc-uuid",
};
const mock = installFacturapiMock({
  "/invoices": (req: Request) =>
    req.method === "POST"
      ? facturapiOk({ id: "fapi_nc_1", uuid: "NC-UUID-OK" })
      : new Response("nf", { status: 404 }),
  "/invoices/fapi_nc_1/xml": () => xmlResponse("<xml/>"),
  "/invoices/fapi_nc_1/pdf": () => pdfResponse(new Uint8Array([0x25])),
});
const caller = buildSupabaseMock({
  claims: { sub: "22222222-2222-4222-8222-222222222222" },
});
const service = buildSupabaseMock({
  selects: {
    user_roles: { data: [{ role: "admin" }], error: null },
    credit_notes: {
      data: {
        id: NC_ID,
        invoice_id: INVOICE_ID,
        tax_rate: 16,
        currency: "MXN",
        line_items: [{ description: "NC", quantity: 1, unit_price: 100 }],
      },
      error: null,
    },
    invoices: { data: STAMPED_INVOICE, error: null },
    company_settings: { data: { facturapi_mode: "test" }, error: null },
    billing_secrets: { data: null, error: null },
  },
  updates: { credit_notes: { data: null, error: null } },
});
const req = new Request("http://localhost/x", {
  method: "POST",
  headers: {
    "Authorization": "Bearer t",
    "Content-Type": "application/json",
    "Origin": "http://localhost:8080",
  },
  body: JSON.stringify({ credit_note_id: NC_ID }),
});
const res = await handleStampCreditNote(req, {
  createCallerClient: () => caller.client,
  createServiceClient: () => service.client,
  fetchImpl: globalThis.fetch,
  env: (k) =>
    ({ FACTURAPI_TEST_KEY: "sk_test_xxx" } as Record<string, string>)[k],
});
console.log("STATUS:", res.status);
console.log("BODY:", await res.text());
mock.restore();
