import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crmQuoteSearchFilter } from "../../../lib/crmQuoteSearchFilter";
import { CRM_QUOTE_ID_BATCH_SIZE, CRM_QUOTE_PAGE_SIZE, useCrmQuote, useCrmQuoteNumbers, useCrmQuoteOptions } from "../useCrmQuotes";

type Row = { id: string; organization_id: string; quote_number: string; customer_name: string; total: number; currency: string; tipo_cambio: number | null; status: string; is_e2e: boolean };
type Request = { columns: string; eq: Record<string, string>; filters: string[]; ids?: string[]; range?: number[]; orders: string[]; signal?: AbortSignal; single: boolean };
const db = vi.hoisted(() => ({
  organizationId: "org-a" as string | undefined, identity: "user-a:org-a:internal" as string | null,
  rows: [] as Row[], requests: [] as Request[], hold: false, pending: [] as Array<() => void>, failBatch: 0,
}));
vi.mock("@/contexts/OrganizationContext", () => ({ useVerifiedOrganizationId: () => db.organizationId }));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => db.identity }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    if (table !== "quotes") throw new Error(`Unexpected table ${table}`);
    const request: Request = { columns: "", eq: {}, filters: [], orders: [], single: false };
    const chain = {
      select: (columns: string) => { request.columns = columns; return chain; },
      eq: (field: string, value: string) => { request.eq[field] = value; return chain; },
      or: (filter: string) => { request.filters.push(filter); return chain; },
      in: (_field: string, ids: string[]) => { request.ids = ids; return chain; },
      order: (field: string) => { request.orders.push(field); return chain; },
      range: (from: number, to: number) => { request.range = [from, to]; return chain; },
      abortSignal: (signal: AbortSignal) => { request.signal = signal; return chain; },
      maybeSingle: () => { request.single = true; return chain; },
      returns: async () => {
        db.requests.push(request);
        // Synthetic database applies the requested tenant predicate. This is NOT live RLS verification.
        let rows = db.rows.filter((row) => Object.entries(request.eq).every(([field, value]) => row[field as keyof Row] === value));
        if (request.filters.includes("is_e2e.is.null,is_e2e.eq.false")) rows = rows.filter((row) => !row.is_e2e);
        if (request.ids) rows = rows.filter((row) => request.ids!.includes(row.id));
        const search = request.filters.find((filter) => filter.startsWith("quote_number.ilike."));
        if (search) {
          const term = /"%([^%]*)%"/.exec(search)?.[1].toLowerCase() ?? "";
          rows = rows.filter((row) => `${row.quote_number} ${row.customer_name}`.toLowerCase().includes(term));
        }
        if (request.range) rows = rows.slice(request.range[0], request.range[1] + 1);
        const result = rows.map((row) => Object.fromEntries(request.columns.split(/,\s*/).map((key) => [key, row[key as keyof Row]])));
        const shouldFail = request.ids && db.failBatch === db.requests.filter((req) => req.ids).length;
        if (db.hold) await new Promise<void>((resolve) => db.pending.push(resolve));
        return shouldFail ? { data: null, error: new Error("synthetic permission failure") }
          : { data: request.single ? result[0] ?? null : result, error: null };
      },
    };
    return chain;
  },
} }));

const clients: QueryClient[] = [];
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function row(index: number, organization = "org-a"): Row {
  return { id: `quote-${index}`, organization_id: organization, quote_number: `COT-${index}`, customer_name: `Customer ${index}`, total: 1160, currency: "USD", tipo_cambio: 18.25, status: "sent", is_e2e: false };
}
beforeEach(() => {
  db.organizationId = "org-a"; db.identity = "user-a:org-a:internal";
  db.rows = Array.from({ length: 1103 }, (_, index) => row(index));
  db.requests = []; db.pending = []; db.hold = false; db.failBatch = 0;
});
afterEach(() => { cleanup(); for (const client of clients) client.clear(); clients.length = 0; db.pending.splice(0).forEach((resolve) => resolve()); });

describe("CRM quote reads independent of list caps", () => {
  it("fetches the selected quote beyond 1000 without loading the quote list", async () => {
    const { result } = renderHook(() => useCrmQuote("quote-1102"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ id: "quote-1102", tipo_cambio: 18.25 });
    expect(db.requests).toHaveLength(1);
    expect(db.requests[0]).toMatchObject({ eq: { id: "quote-1102", organization_id: "org-a" }, single: true });
    expect(db.requests[0].range).toBeUndefined();
  });

  it("paginates options in deterministic 50-row requests and finds an older company server-side", async () => {
    const { result, rerender } = renderHook(({ search }) => useCrmQuoteOptions(search), { initialProps: { search: "" }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]).toHaveLength(CRM_QUOTE_PAGE_SIZE);
    await act(async () => { await result.current.fetchNextPage(); });
    await waitFor(() => expect(result.current.data?.pages.flat()).toHaveLength(100));
    expect(db.requests[0]).toMatchObject({ range: [0, 49], orders: ["created_at", "id"] });
    expect(db.requests[1].range).toEqual([50, 99]);
    rerender({ search: "Customer 1102" });
    await waitFor(() => expect(result.current.data?.pages.flat()).toHaveLength(1));
    expect(result.current.data?.pages[0][0].id).toBe("quote-1102");
    expect(db.requests[2].filters).toContain(crmQuoteSearchFilter("Customer 1102"));
    expect(result.current.hasNextPage).toBe(false);
  });

  it("hydrates 1103 map references using bounded deduplicated batches and excludes other tenants/E2E", async () => {
    db.rows.push(row(9000, "org-b"), { ...row(9001), is_e2e: true });
    const ids = [...db.rows.map((quote) => quote.id), "quote-1"];
    const { result } = renderHook(() => useCrmQuoteNumbers(ids), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1103);
    expect(result.current.data?.some((quote) => quote.id === "quote-1102")).toBe(true);
    expect(result.current.data?.some((quote) => ["quote-9000", "quote-9001"].includes(quote.id))).toBe(false);
    expect(db.requests).toHaveLength(12);
    for (const request of db.requests) {
      expect(request.ids!.length).toBeLessThanOrEqual(CRM_QUOTE_ID_BATCH_SIZE);
      expect(request.columns).toBe("id, quote_number");
      expect(request.eq.organization_id).toBe("org-a");
      expect(request.filters).toEqual(["is_e2e.is.null,is_e2e.eq.false"]);
    }
  });

  it("does not expose partial map results when a later batch fails", async () => {
    db.failBatch = 2;
    const { result } = renderHook(() => useCrmQuoteNumbers(db.rows.map((quote) => quote.id)), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(db.requests).toHaveLength(2);
  });

  it("does not query without verified identity, even when refetch is explicitly called", async () => {
    db.identity = null;
    const { result } = renderHook(() => ({ selected: useCrmQuote("quote-1"), options: useCrmQuoteOptions(""), numbers: useCrmQuoteNumbers(["quote-1"]) }), { wrapper: wrapper() });
    expect(db.requests).toHaveLength(0);
    expect(result.current.selected.isError).toBe(false);
    await act(async () => { await result.current.selected.refetch(); await result.current.options.refetch(); await result.current.numbers.refetch(); });
    expect(db.requests).toHaveLength(0);
    await waitFor(() => expect(result.current.selected.isError).toBe(true));
  });

  it("does not read options/detail for a closed form or an empty map", () => {
    const { result } = renderHook(() => ({ selected: useCrmQuote("quote-1", false), options: useCrmQuoteOptions("", false), numbers: useCrmQuoteNumbers([]) }), { wrapper: wrapper() });
    expect(db.requests).toHaveLength(0);
    expect(result.current.selected.fetchStatus).toBe("idle");
    expect(result.current.selected.isPending).toBe(true);
    expect(result.current.options.fetchStatus).toBe("idle");
    expect(result.current.numbers.fetchStatus).toBe("idle");
  });

  it("returns unavailable for a foreign/E2E reference instead of reusing the unrestricted ID", async () => {
    db.rows = [row(1, "org-b"), { ...row(2), is_e2e: true }];
    const { result, rerender } = renderHook(({ id }) => useCrmQuote(id), { initialProps: { id: "quote-1" }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    rerender({ id: "quote-2" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("switches identity without showing cached or late previous-tenant data", async () => {
    db.rows = [row(1), { ...row(1, "org-b"), customer_name: "Only B" }];
    const { result, rerender } = renderHook(() => useCrmQuote("quote-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.customer_name).toBe("Customer 1"));
    db.hold = true;
    act(() => { void result.current.refetch(); });
    await waitFor(() => expect(db.pending).toHaveLength(1));
    db.identity = "user-b:org-b:internal"; db.organizationId = "org-b";
    rerender();
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(db.pending).toHaveLength(2));
    expect(db.requests[1].signal?.aborted).toBe(true);
    await act(async () => { db.pending.shift()!(); });
    expect(result.current.data).toBeUndefined();
    await act(async () => { db.pending.shift()!(); });
    await waitFor(() => expect(result.current.data?.customer_name).toBe("Only B"));
  });

  it("keys same-organization users separately and never validates a new selected ID with old data", async () => {
    const { result, rerender } = renderHook(({ id }) => useCrmQuote(id), { initialProps: { id: "quote-1" as string | null }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.id).toBe("quote-1"));
    db.hold = true;
    db.identity = "user-b:org-a:internal";
    rerender({ id: "quote-1" });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(db.pending).toHaveLength(1));
    rerender({ id: "quote-2" });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(db.pending).toHaveLength(2));
    await act(async () => { db.pending.shift()!(); });
    expect(result.current.data).toBeUndefined();
    rerender({ id: null });
    await act(async () => { db.pending.shift()!(); });
    expect(result.current.data).toBeUndefined();
    expect(result.current.fetchStatus).toBe("idle");
  });
});
