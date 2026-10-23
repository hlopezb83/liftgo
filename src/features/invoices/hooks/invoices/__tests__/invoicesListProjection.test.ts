import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseChainMock, type ChainCall } from "@/test/helpers/supabaseChain";
import { invoiceQueries, type InvoiceListItem } from "../invoiceQueries";

let selected: string[] = [];
vi.mock("@/integrations/supabase/client", () => {
  const client = createSupabaseChainMock({ tableResolvers: {
    invoices: (calls: ChainCall[]) => {
      const select = calls.find(call => call.method === "select")?.args[0];
      selected = String(select).split(",").map(field => field.trim());
      const detail = calls.some(call => call.method === "maybeSingle");
      return { data: detail ? { ...listFixture, line_items: [], cfdi_xml: "<xml />", } : [listFixture], error: null };
    },
  } });
  return { supabase: { ...client, auth: { ...client.auth,
    getSession: vi.fn(async () => ({ data: { session: { user: { id: "qa-user" } } }, error: null })),
  } } };
});

const listFixture = {
  id: "qa-id",
  invoice_number: "qa-invoice_number",
  folio: null,
  serie: null,
  customer_id: null,
  customer_name: null,
  booking_id: null,
  quote_id: null,
  status: "qa-status",
  cfdi_status: null,
  cfdi_uuid: null,
  cfdi_pdf_url: null,
  cfdi_xml_url: null,
  cfdi_error_message: null,
  cancellation_status: "qa-cancellation_status",
  cancellation_motive: null,
  cancellation_reason: null,
  cancelled_at: null,
  substitution_uuid: null,
  acuse_pdf_url: null,
  acuse_xml_url: null,
  facturapi_invoice_id: null,
  facturapi_env: null,
  stamping_attempts: 0,
  stamp_variance: null,
  stamp_variance_checked_at: null,
  invoice_type: "qa-invoice_type",
  forma_pago: null,
  metodo_pago: null,
  uso_cfdi: null,
  moneda: null,
  tipo_cambio: null,
  global_months: null,
  global_periodicity: null,
  global_year: null,
  receptor_rfc: null,
  receptor_razon_social: null,
  receptor_regimen_fiscal: null,
  receptor_domicilio_fiscal_cp: null,
  subtotal: 0,
  tax_rate: 0,
  tax_amount: 0,
  total: 0,
  notes: null,
  version: 0,
  billing_period_start: null,
  billing_period_end: null,
  issued_at: "qa-issued_at",
  due_date: null,
  paid_at: null,
  e2e_scope: null,
  is_e2e: false,
  created_at: "qa-created_at",
  updated_at: "qa-updated_at",
} satisfies InvoiceListItem;

beforeEach(() => { selected = []; });
describe("invoices read projections", () => {
  it("list fixture has exactly the selected columns, without document payload", async () => {
    const client = new QueryClient();
    const rows = await client.fetchQuery(invoiceQueries.list());
    expect(selected.sort()).toEqual(Object.keys(listFixture).sort());
    expect(rows).toEqual([listFixture]);
    expect(rows[0]).not.toHaveProperty("line_items");
    expect(rows[0]).not.toHaveProperty("cfdi_xml");
    client.clear();
  });
  it("detail still loads document-only data explicitly", async () => {
    const client = new QueryClient();
    const detail = await client.fetchQuery(invoiceQueries.detail("qa-id"));
    expect(selected).toContain("line_items");
    expect(detail?.line_items).toEqual([]);
    expect(selected).toContain("cfdi_xml");
    expect(detail?.cfdi_xml).toBe("<xml />");
    client.clear();
  });
});
