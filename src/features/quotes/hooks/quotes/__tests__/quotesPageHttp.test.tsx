import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { QuotesPageRpcArgs } from "../../../lib/quotesPageRpc";
import type { QuoteListItem } from "../useQuotes";

interface Fixture extends QuoteListItem {
  organization_id: string; created_at: string; is_e2e: boolean | null;
}
const state = vi.hoisted(() => ({
  fetch: vi.fn(), session: vi.fn(),
  requests: [] as { url: URL; method: string; body: QuotesPageRpcArgs; signal?: AbortSignal | null }[],
  rows: [] as Fixture[], error: "", override: undefined as unknown,
  organization: { status: "ready", organizationId: "org-a" },
}));
vi.mock("@/features/fleet", () => ({}));
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganizationContext: () => state.organization }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient("http://127.0.0.1:54321", "offline", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args: Parameters<typeof fetch>) => state.fetch(...args) },
  });
  client.auth.getSession = state.session;
  return { supabase: client };
});
import { quoteQueries } from "../useQuotes";
import { quotesPageQueryOptions, useQuotesPage, type QuotesPageFilters } from "../useQuotesPage";

const defaults: QuotesPageFilters = { search: "", status: "all", pageIndex: 0, pageSize: 25, sorting: [] };
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
const page = (filters: Partial<QuotesPageFilters> = {}, org = "org-a") =>
  client().fetchQuery(quotesPageQueryOptions(org, { ...defaults, ...filters }));
const old: Fixture = {
  id: "old", organization_id: "org-a", quote_number: "COT-0445", customer_name: "Cliente antiguo único",
  status: "accepted", created_at: "2020-01-01", is_e2e: null, customer_id: null, forklift_id: null,
  start_date: null, end_date: null, subtotal: 100, tax_rate: 16, tax_amount: 16, total: 116,
  valid_until: null, quote_type: "rental", currency: "MXN", tipo_cambio: 1,
};

// Transport fixture, not a SQL correctness oracle. SQL semantics have separate PostgreSQL tests.
function serve(args: QuotesPageRpcArgs) {
  const needle = args.p_search?.toLowerCase();
  let rows = state.rows.filter((row) => row.organization_id === args.p_expected_organization_id && row.is_e2e !== true)
    .filter((row) => args.p_status === "all" || row.status === args.p_status)
    .filter((row) => !needle || `${row.quote_number} ${row.customer_name}`.toLowerCase().includes(needle));
  rows = rows.sort((a, b) => {
    for (const { id, desc } of args.p_sort) {
      const compared = String(a[id as keyof Fixture] ?? "").localeCompare(String(b[id as keyof Fixture] ?? ""), undefined, { numeric: id === "quote_number" });
      if (compared) return compared * (desc ? -1 : 1);
    }
    return b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
  });
  const pageIndex = Math.min(args.p_page, Math.max(0, Math.ceil(rows.length / args.p_page_size) - 1));
  return { items: rows.slice(pageIndex * args.p_page_size, (pageIndex + 1) * args.p_page_size), totalCount: rows.length, pageIndex };
}

beforeEach(() => {
  state.organization = { status: "ready", organizationId: "org-a" };
  state.requests = []; state.error = ""; state.override = undefined;
  state.session.mockReset().mockResolvedValue({ data: { session: { user: { id: "qa" } } }, error: null });
  state.rows = [{ ...old }, ...Array.from({ length: 500 }, (_, n) => ({
    ...old, id: `new-${String(n).padStart(4, "0")}`, quote_number: `COT-${1000 + n}`, customer_name: "Cliente reciente",
    status: "draft", created_at: "2026-01-01", is_e2e: false,
  })), { ...old, id: "other-org", organization_id: "org-b" }, { ...old, id: "e2e", is_e2e: true }];
  state.fetch.mockReset().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)), method = init?.method ?? "GET";
    const body = JSON.parse(String(init?.body)) as QuotesPageRpcArgs;
    state.requests.push({ url, method, body, signal: init?.signal });
    expect(url.pathname).toBe("/rest/v1/rpc/get_quotes_page");
    expect(url.search).toBe("");
    expect(method).toBe("POST");
    if (state.error) return new Response(JSON.stringify({ code: state.error, message: "Simulated failure" }), { status: state.error === "PGRST202" ? 404 : 403 });
    return new Response(JSON.stringify(state.override === undefined ? serve(body) : state.override), { headers: { "Content-Type": "application/json" } });
  });
});

describe("Cotizaciones: authenticated RPC through real Supabase SDK", () => {
  it("returns old row 501 using server search/status before pagination", async () => {
    for (const filters of [{ search: "antiguo" }, { status: "accepted" }, { search: "antiguo", status: "accepted" }]) {
      expect(await page(filters)).toMatchObject({ items: [{ id: "old" }], totalCount: 1, pageIndex: 0 });
    }
    expect((await page({ search: "antiguo", status: "draft" })).totalCount).toBe(0);
  });

  it("pages all 501 rows without a 500-row fallback", async () => {
    const ids: string[] = [];
    for (let pageIndex = 0; pageIndex < 6; pageIndex++) {
      const result = await page({ pageIndex, pageSize: 100 });
      expect(result.totalCount).toBe(501);
      ids.push(...result.items.map((row) => row.id));
      expect(state.requests.at(-1)?.body).toEqual({ p_expected_organization_id: "org-a", p_search: null, p_status: "all", p_page: pageIndex, p_page_size: 100, p_sort: [] });
    }
    expect(new Set(ids).size).toBe(501);
    expect(ids).toHaveLength(501);
    expect(ids.at(-1)).toBe("old");
  });

  it.each(['ACME, ("50%_\\")', 'José Muñoz', 'Jose\u0301', 'cot-445', '000900719925474099312345', 'a'.repeat(500)])("sends literal search in JSON without regex or URL expansion: %s", async (search) => {
    await page({ search });
    expect(state.requests[0].body.p_search).toBe(search);
  });

  it("normalizes URL pagination/status/sort using allowlists and keeps scope out of URL input", async () => {
    await page({ status: "unknown", pageIndex: -8, pageSize: 900, sorting: [{ id: "quote_number", desc: false }, { id: "organization_id", desc: true }] });
    expect(state.requests[0].body).toEqual({ p_expected_organization_id: "org-a", p_search: null, p_status: "all", p_page: 0, p_page_size: 100, p_sort: [{ id: "quote_number", desc: false }] });
    await page({ pageIndex: Number.NaN, pageSize: Number.NaN });
    expect(state.requests[1].body).toMatchObject({ p_page: 0, p_page_size: 25 });
  });

  it("deduplicates URL sort IDs before limiting and preserves the first direction and cache key", async () => {
    const sorting = [
      { id: "quote_number", desc: true },
      ...Array.from({ length: 5 }, () => ({ id: "quote_number", desc: false })),
      { id: "organization_id", desc: true },
      { id: "total", desc: false },
      { id: "total", desc: true },
      { id: "customer_name", desc: true },
    ];
    const expected = [sorting[0], { id: "total", desc: false }, { id: "customer_name", desc: true }];
    await page({ sorting });
    expect(state.requests[0].body.p_sort).toEqual(expected);
    expect(quotesPageQueryOptions("org-a", { ...defaults, sorting }).queryKey)
      .toEqual(quotesPageQueryOptions("org-a", { ...defaults, sorting: expected }).queryKey);
    expect(sorting).toHaveLength(10);
  });

  it("uses server natural folio ordering across page boundaries", async () => {
    state.rows = ["COT-10000", "COT-2", "COT-9999"].map((quote_number, index) => ({ ...old, id: String(index), quote_number }));
    const folios: string[] = [];
    for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
      const result = await page({ pageIndex, pageSize: 1, sorting: [{ id: "quote_number", desc: false }] });
      folios.push(result.items[0].quote_number);
    }
    expect(folios).toEqual(["COT-2", "COT-9999", "COT-10000"]);
  });

  it("accepts server-clamped stale pages and explicit empty results in one RPC", async () => {
    expect(await page({ pageIndex: 99, status: "accepted" })).toMatchObject({ pageIndex: 0, totalCount: 1, items: [{ id: "old" }] });
    expect(state.requests).toHaveLength(1);
    expect(await page({ pageIndex: 99, search: "absent" })).toEqual({ items: [], totalCount: 0, pageIndex: 0 });
  });

  it.each(["42501", "PGRST202", "22023"])("surfaces %s without retrying via legacy REST", async (code) => {
    state.error = code;
    await expect(page()).rejects.toMatchObject({ code });
    expect(state.requests).toHaveLength(1);
  });

  it.each([
    null, {}, { items: [], totalCount: null, pageIndex: 0 },
    { items: [], totalCount: -1, pageIndex: 0 }, { items: [], totalCount: 1.5, pageIndex: 0 },
    { items: [], totalCount: Number.MAX_SAFE_INTEGER + 1, pageIndex: 0 },
    { items: [], totalCount: 1, pageIndex: 0 }, { items: [], totalCount: 0, pageIndex: 1 },
    { items: [{}], totalCount: 1, pageIndex: 0 },
    { items: [{ ...old, total: null }], totalCount: 1, pageIndex: 0 },
    { items: [old, old], totalCount: 2, pageIndex: 0 },
  ])("rejects malformed or inconsistent response %#", async (response) => {
    state.override = response;
    await expect(page()).rejects.toThrow(/cotizaciones/);
  });

  it("does not call RPC for missing session or auth errors", async () => {
    state.session.mockResolvedValue({ data: { session: null }, error: null });
    await expect(page()).rejects.toMatchObject({ status: 401 });
    state.session.mockResolvedValue({ data: { session: null }, error: new Error("auth unavailable") });
    await expect(page()).rejects.toThrow("auth unavailable");
    expect(state.requests).toEqual([]);
  });

  it("passes query cancellation to the SDK transport", async () => {
    let signal: AbortSignal | undefined;
    state.fetch.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      signal = init?.signal ?? undefined;
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const cache = client(), options = quotesPageQueryOptions("org-a", defaults);
    const request = cache.fetchQuery(options).catch((error: unknown) => error);
    await waitFor(() => expect(signal).toBeDefined());
    await cache.cancelQueries({ queryKey: options.queryKey });
    expect(signal?.aborted).toBe(true);
    await request;
    expect(cache.getQueryData(options.queryKey)).toBeUndefined();
  });

  it("isolates tenant caches and invalidates all page keys through the existing list namespace", async () => {
    const cache = client();
    const a = quotesPageQueryOptions("org-a", defaults), b = quotesPageQueryOptions("org-b", defaults);
    expect(a.queryKey).not.toEqual(b.queryKey);
    expect((await cache.fetchQuery(a)).totalCount).toBe(501);
    expect((await cache.fetchQuery(b)).items.map((row) => row.id)).toEqual(["other-org"]);
    await cache.invalidateQueries({ queryKey: quoteQueries.keys.lists() });
    expect(cache.getQueryState(a.queryKey)?.isInvalidated).toBe(true);
    expect(cache.getQueryState(b.queryKey)?.isInvalidated).toBe(true);
  });

  it("does not fetch without a verified tenant or retain old-tenant rows during a switch", async () => {
    const cache = client();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
    state.organization = { status: "loading", organizationId: "" };
    const { result, rerender } = renderHook(() => useQuotesPage(defaults), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(state.requests).toEqual([]);
    act(() => { state.organization = { status: "ready", organizationId: "org-a" }; rerender(); });
    await waitFor(() => expect(result.current.data?.totalCount).toBe(501));
    act(() => { state.organization = { status: "ready", organizationId: "org-b" }; rerender(); });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.items[0].id).toBe("other-org"));
    act(() => { state.organization = { status: "error", organizationId: "" }; rerender(); });
    expect(result.current.isError).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});
