import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryPageRpcArgs } from "../../lib/inventoryPageRpc";
const state = vi.hoisted(() => ({ fetch: vi.fn(), session: vi.fn(), bad: false, error: false, requests: [] as InventoryPageRpcArgs[] }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient("http://127.0.0.1:54321", "offline", { auth: { persistSession: false }, global: { fetch: (...args: Parameters<typeof fetch>) => state.fetch(...args) } });
  supabase.auth.getSession = state.session;
  return { supabase };
});
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganizationContext: () => ({ status: "ready", organizationId: "a" }) }));
import { inventoryPageQueryOptions, type InventoryPageFilters } from "../useInventoryPage";
const defaults: InventoryPageFilters = { search: "", category: "all", pageIndex: 0, pageSize: 25, sorting: [] };
const part = (id: number, org = "a") => ({ id: `p${id}`, organization_id: org, catalog_part_id: null, name: id === 500 ? "Z especial" : `P${id}`, sku: id === 500 ? "TARGET" : `SKU${id}`, category: id === 500 ? "Baterías" : "Filtros", stock_quantity: id === 500 ? 0 : 10, min_stock_level: 2, unit_cost: 5, location: null, is_active: true, created_at: "2026-01-01", updated_at: "2026-01-01" });
function client() { return new QueryClient({ defaultOptions: { queries: { retry: false } } }); }
function query(input: Partial<InventoryPageFilters> = {}, org = "a", c = client()) { return c.fetchQuery(inventoryPageQueryOptions(org, { ...defaults, ...input })); }
beforeEach(() => {
  state.requests = []; state.bad = false; state.error = false;
  state.session.mockResolvedValue({ data: { session: { access_token: "synthetic" } }, error: null });
  state.fetch.mockImplementation(async (url: string, init: RequestInit) => {
    expect(String(url)).toContain("/rpc/get_inventory_page"); expect(init.method).toBe("POST");
    const args: InventoryPageRpcArgs = JSON.parse(String(init.body)); state.requests.push(args);
    if (state.error) return new Response(JSON.stringify({ message: "Denied", code: "42501" }), { status: 403 });
    const all = Array.from({ length: args.p_expected_organization_id === "a" ? 501 : 1 }, (_, i) => part(i, args.p_expected_organization_id));
    const rows = all.filter((p) => (!args.p_search || `${p.name} ${p.sku}`.toLowerCase().includes(args.p_search.toLowerCase())) && (args.p_category === "all" || p.category === args.p_category) && (!args.p_low_stock || p.stock_quantity <= p.min_stock_level));
    const pageIndex = Math.min(args.p_page, Math.max(0, Math.ceil(rows.length / args.p_page_size) - 1));
    const items = rows.slice(pageIndex * args.p_page_size, (pageIndex + 1) * args.p_page_size);
    if (state.bad && items[0]) items[0].organization_id = "other";
    return new Response(JSON.stringify({ items, totalCount: rows.length, pageIndex, lowStockCount: all.filter((p) => p.stock_quantity <= p.min_stock_level).length }), { headers: { "content-type": "application/json" } });
  });
});
describe("inventory page RPC HTTP contract", () => {
  it("finds row501 and global low stock independently of filters", async () => {
    expect((await query({ pageIndex: 20 })).items[0].sku).toBe("TARGET");
    expect((await query({ search: "target" })).totalCount).toBe(1);
    expect((await query({ category: "Baterías" })).totalCount).toBe(1);
    expect(await query({ search: "absent" })).toMatchObject({ items: [], totalCount: 0, lowStockCount: 1 });
  });
  it("clamps stale page and preserves category/search in POST", async () => {
    expect((await query({ pageIndex: 200, search: "TARGET", category: "Baterías" })).pageIndex).toBe(0);
    expect(state.requests[0]).toMatchObject({ p_search: "TARGET", p_category: "Baterías", p_expected_organization_id: "a" });
  });
  it("requests low stock before paging, keeps the global count and separates cached filters", async () => {
    const c = client();
    expect((await query({}, "a", c)).totalCount).toBe(501);
    expect(state.requests[0]).not.toHaveProperty("p_low_stock");
    const filtered = await query({ lowStockOnly: true, pageIndex: 20 }, "a", c);
    expect(filtered).toMatchObject({ totalCount: 1, lowStockCount: 1, pageIndex: 0 });
    expect(filtered.items[0].sku).toBe("TARGET");
    expect(state.requests[1]).toMatchObject({ p_low_stock: true, p_page: 20 });
    expect(await query({ lowStockOnly: true, category: "Filtros" })).toMatchObject({ items: [], totalCount: 0, lowStockCount: 1 });
  });
  it("rejects rows that do not satisfy the requested low-stock filter", async () => {
    state.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ items: [part(0)], totalCount: 1, pageIndex: 0, lowStockCount: 1 }), { headers: { "content-type": "application/json" } }));
    await expect(query({ lowStockOnly: true })).rejects.toThrow("filtro de stock bajo");
  });
  it("isolates cache across tenants", async () => { const c = client(); expect((await query({}, "a", c)).totalCount).toBe(501); expect((await query({}, "b", c)).totalCount).toBe(1); expect(state.requests).toHaveLength(2); });
  it("rejects a response from another tenant", async () => { state.bad = true; await expect(query()).rejects.toThrow(); });
  it("does not fall back on permission errors", async () => { state.error = true; await expect(query()).rejects.toBeTruthy(); expect(state.requests).toHaveLength(1); });
  it("does not query without session or organization", async () => { state.session.mockResolvedValue({ data: { session: null }, error: null }); await expect(query()).rejects.toThrow(); await expect(query({}, "")).rejects.toThrow(); expect(state.requests).toHaveLength(0); });
  it("keeps safe sort columns and removes duplicate IDs", async () => { await query({ sorting: [{ id: "sku", desc: true }, { id: "sku", desc: false }, { id: "sql", desc: false }] }); expect(state.requests[0].p_sort).toEqual([{ id: "sku", desc: true }]); });
  it("invalidates page data with existing inventory mutation root", async () => { const c = client(); await query({}, "a", c); await c.invalidateQueries({ queryKey: ["parts_inventory"] }); await query({}, "a", c); expect(state.requests).toHaveLength(2); });
});
