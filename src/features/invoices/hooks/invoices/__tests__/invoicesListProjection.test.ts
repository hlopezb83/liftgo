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
  customer_name: null,
  status: "qa-status",
  moneda: null,
  total: 0,
  issued_at: "qa-issued_at",
  due_date: null,
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
