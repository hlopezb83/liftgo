import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseChainMock, type ChainCall } from "@/test/helpers/supabaseChain";
import { quoteQueries, type QuoteListItem } from "../useQuotes";

let selected: string[] = [];
vi.mock("@/integrations/supabase/client", () => {
  const client = createSupabaseChainMock({ tableResolvers: {
    quotes: (calls: ChainCall[]) => {
      const select = calls.find(call => call.method === "select")?.args[0];
      selected = String(select).split(",").map(field => field.trim());
      const detail = calls.some(call => call.method === "maybeSingle");
      return { data: detail ? { ...listFixture, line_items: [], rental_meta: [], } : [listFixture], error: null };
    },
  } });
  return { supabase: { ...client, auth: { ...client.auth,
    getSession: vi.fn(async () => ({ data: { session: { user: { id: "qa-user" } } }, error: null })),
  } } };
});

const listFixture = {
  id: "qa-id",
  quote_number: "qa-quote_number",
  customer_id: null,
  customer_name: null,
  forklift_id: null,
  start_date: null,
  end_date: null,
  subtotal: 0,
  tax_rate: 0,
  tax_amount: 0,
  total: 0,
  status: "qa-status",
  valid_until: null,
  quote_type: "qa-quote_type",
  currency: "qa-currency",
  tipo_cambio: 0,
} satisfies QuoteListItem;

beforeEach(() => { selected = []; });
describe("quotes read projections", () => {
  it("list fixture has exactly the selected columns, without document payload", async () => {
    const client = new QueryClient();
    const rows = await client.fetchQuery(quoteQueries.list());
    expect(selected.sort()).toEqual(Object.keys(listFixture).sort());
    expect(rows).toEqual([listFixture]);
    expect(rows[0]).not.toHaveProperty("line_items");
    expect(rows[0]).not.toHaveProperty("rental_meta");
    client.clear();
  });
  it("detail still loads document-only data explicitly", async () => {
    const client = new QueryClient();
    const detail = await client.fetchQuery(quoteQueries.detail("qa-id"));
    expect(selected).toContain("line_items");
    expect(detail?.line_items).toEqual([]);
    expect(selected).toContain("rental_meta");
    expect(detail?.rental_meta).toEqual([]);
    client.clear();
  });
});
