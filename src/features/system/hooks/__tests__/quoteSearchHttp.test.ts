import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchEntities } from "../../lib/globalSearchRpc";
import { normalizeQuoteNumber } from "../../lib/quoteSearchTerm";

const state = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("http://127.0.0.1:54321", "offline", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args: Parameters<typeof fetch>) => state.fetch(...args) },
  }) };
});

const access = { invoices: false, quotes: true, customers: false, bookings: false, deliveries: false, returns: false };
const empty = { invoices: [], quotes: [], customers: [], bookings: [], deliveries: [], returns: [] };

beforeEach(() => state.fetch.mockReset());

describe("quote search via a single authenticated PostgREST RPC", () => {
  it("sends literal terms as bound arguments and forwards the cancellation signal", async () => {
    const controller = new AbortController();
    const term = 'acme*(x|y), ("50%_\\")';
    const quote = { id: "old", label: "COT-0445", url: "/quotes/old" };
    state.fetch.mockResolvedValue(new Response(JSON.stringify({ ...empty, quotes: [quote] }), {
      headers: { "Content-Type": "application/json" },
    }));
    const result = await searchEntities(term, "org-a", access, controller.signal);
    expect(result.quotes).toEqual([quote]);
    expect(state.fetch).toHaveBeenCalledTimes(1);
    const [input, init] = state.fetch.mock.calls[0];
    expect(new URL(String(input)).pathname).toBe("/rest/v1/rpc/get_global_search");
    expect(init.method).toBe("POST");
    expect(init.signal).toBe(controller.signal);
    expect(JSON.parse(String(init.body))).toEqual({
      p_expected_organization_id: "org-a", p_query: term, p_sections: ["quotes"],
    });
  });

  it("does not accept a response after cancellation, even if the transport delivers it", async () => {
    const controller = new AbortController();
    state.fetch.mockImplementation(async () => {
      controller.abort();
      return new Response(JSON.stringify(empty), { headers: { "Content-Type": "application/json" } });
    });
    await expect(searchEntities("445", "org-a", access, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("strict quote labels for the command palette", () => {
  it.each(["COT 445", "COT-44a5", "445 cliente", "-445", "4.45", "COT-", "ACME,445"])("does not normalize %s", (input) => {
    expect(normalizeQuoteNumber(input)).toBeUndefined();
  });
  it("keeps external spaces, zero and folios above Number.MAX_SAFE_INTEGER precise", () => {
    expect(normalizeQuoteNumber(" cot-000445 ")).toBe("COT-0445");
    expect(normalizeQuoteNumber("0000")).toBe("COT-0000");
    expect(normalizeQuoteNumber("00090071992547409934567")).toBe("COT-90071992547409934567");
  });
});
