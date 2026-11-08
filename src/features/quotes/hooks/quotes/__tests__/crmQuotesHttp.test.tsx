import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crmQuoteSearchFilter } from "../../../lib/crmQuoteSearchFilter";
import { useCrmQuote, useCrmQuoteNumbers, useCrmQuoteOptions } from "../useCrmQuotes";

const state = vi.hoisted(() => ({ fetch: vi.fn(), requests: [] as URL[] }));
vi.mock("@/contexts/OrganizationContext", () => ({ useVerifiedOrganizationId: () => "org-a" }));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => "user-a:org-a:internal" }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("http://127.0.0.1:54321", "test-offline", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args: Parameters<typeof fetch>) => state.fetch(...args) },
  }) };
});
const clients: QueryClient[] = [];
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  state.requests = [];
  state.fetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    state.requests.push(url);
    return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } });
  });
});
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; });

describe("CRM quotes PostgREST contract with offline HTTP transport", () => {
  it.each(['ACME, ("50%_\\")', 'ACME*(x|y).[a]+?^${}50%_\\"'])("keeps tenant/E2E filters and quotes literal search %s", async (term) => {
    const { result } = renderHook(() => useCrmQuoteOptions(term), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = state.requests[0];
    expect(url.searchParams.get("organization_id")).toBe("eq.org-a");
    expect(url.searchParams.getAll("or")).toEqual(["(is_e2e.is.null,is_e2e.eq.false)", `(${crmQuoteSearchFilter(term)})`]);
    expect(url.searchParams.get("order")).toBe("created_at.desc,id.desc");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(url.searchParams.get("limit")).toBe("50");
    const operator = term.includes("*") ? "imatch" : "ilike";
    const filter = crmQuoteSearchFilter(term);
    const quoted = filter.slice(`quote_number.${operator}.`.length, filter.indexOf(`,customer_name.${operator}.`));
    const literal = quoted.slice(1, -1).replace(/\\([\\"])/g, "$1");
    if (term.includes("*")) {
      expect(new RegExp(literal, "i").test(`prefix ${term} suffix`)).toBe(true);
      expect(new RegExp(literal, "i").test(term.replace("*", "%"))).toBe(false);
    } else {
      expect(literal).toBe('%ACME, ("50\\%\\_\\\\")%');
    }
  });

  it("uses narrow scoped ID and batch requests without the 501-row list limit", async () => {
    const { result } = renderHook(() => ({ one: useCrmQuote("old-id"), map: useCrmQuoteNumbers(["old-id", "second-id"]) }), { wrapper: wrapper() });
    await waitFor(() => { expect(result.current.one.isSuccess).toBe(true); expect(result.current.map.isSuccess).toBe(true); });
    expect(state.requests).toHaveLength(2);
    for (const url of state.requests) {
      expect(url.searchParams.get("organization_id")).toBe("eq.org-a");
      expect(url.searchParams.getAll("or")).toEqual(["(is_e2e.is.null,is_e2e.eq.false)"]);
      expect(url.searchParams.get("limit")).toBeNull();
      expect(url.searchParams.get("select")).not.toContain("line_items");
    }
    expect(state.requests.map((url) => url.searchParams.get("id"))).toContain("eq.old-id");
    expect(state.requests.map((url) => url.searchParams.get("id"))).toContain("in.(old-id,second-id)");
  });
});
