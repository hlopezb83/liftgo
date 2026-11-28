import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { InventoryPageRpcArgs } from "@/features/inventory/lib/inventoryPageRpc";
const state = vi.hoisted(() => ({ organization: "a", identity: "user:a", fetch: vi.fn(), requests: [] as InventoryPageRpcArgs[], selectedStock: 7, fail: false, invalidStock: false }));
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganizationContext: () => ({ status: "ready", memberType: "internal", organizationId: state.organization }) }));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => state.identity }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient("http://127.0.0.1:54321", "offline", { auth: { persistSession: false }, global: { fetch: (...args: Parameters<typeof fetch>) => state.fetch(...args) } });
  supabase.auth.getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: "offline" } }, error: null });
  return { supabase };
});
import { useMaintenancePartOptions } from "../useMaintenancePartOptions";
const part = (index: number, organization = "a") => ({ id: `part-${index}`, organization_id: organization, catalog_part_id: null,
  name: `Filtro ${String(index).padStart(4, "0")}`, sku: index === 502 ? "ZQX-TARGET" : `SKU-${index}`, category: "Filtros",
  stock_quantity: index < 50 ? 0 : 7, min_stock_level: 2, unit_cost: 5, location: null, is_active: true, created_at: "2026-01-01", updated_at: "2026-01-01" });
beforeEach(() => {
  state.organization = "a"; state.identity = "user:a"; state.requests = []; state.selectedStock = 7; state.fail = false; state.invalidStock = false;
  state.fetch.mockImplementation(async (input: RequestInfo | URL, init: RequestInit) => {
    const url = new URL(String(input));
    if (state.fail) return new Response(JSON.stringify({ code: "500", message: "offline" }), { status: 500 });
    if (url.pathname.endsWith("/parts_inventory")) return new Response(JSON.stringify({ ...part(502, state.organization), stock_quantity: state.selectedStock }), { headers: { "content-type": "application/json" } });
    const args = JSON.parse(String(init.body)) as InventoryPageRpcArgs; state.requests.push(args);
    const rows = Array.from({ length: 553 }, (_, i) => part(i, args.p_expected_organization_id)).filter(row =>
      (!args.p_maintenance_stock || row.stock_quantity > 0) && (!args.p_search || `${row.name} ${row.sku}`.toLowerCase().includes(args.p_search.toLowerCase())));
    const pageIndex = Math.min(args.p_page, Math.max(0, Math.ceil(rows.length / args.p_page_size) - 1));
    const items = rows.slice(pageIndex * args.p_page_size, (pageIndex + 1) * args.p_page_size);
    if (state.invalidStock && items[0]) items[0].stock_quantity = 0;
    return new Response(JSON.stringify({ items, pageIndex, totalCount: rows.length, lowStockCount: 50 }), { headers: { "content-type": "application/json" } });
  });
});
function mount(options = { open: true, search: "", page: 0, selectedId: null as string | null }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(props => useMaintenancePartOptions(props), { initialProps: options, wrapper }) };
}
it("searches beyond 501 with stock filtered on the server and clamps pages", async () => {
  const { result, rerender } = mount();
  await waitFor(() => expect(result.current.pageQuery.isSuccess).toBe(true));
  expect(state.requests[0]).toMatchObject({ p_maintenance_stock: true, p_low_stock: false, p_page_size: 25 });
  expect(result.current.pageQuery.data).toMatchObject({ totalCount: 503, pageIndex: 0 });
  expect(result.current.pageQuery.data?.items).toHaveLength(25);
  rerender({ open: true, search: "ZQX-TARGET", page: 20, selectedId: null });
  await waitFor(() => expect(result.current.pageQuery.data?.items[0]?.id).toBe("part-502"));
  expect(result.current.pageQuery.data).toMatchObject({ totalCount: 1, pageIndex: 0 });
});
it("keeps the selected SKU independent of search and refreshes its current stock", async () => {
  const { result, rerender, client } = mount({ open: true, search: "ZQX-TARGET", page: 0, selectedId: "part-502" });
  await waitFor(() => expect(result.current.selectedQuery.data?.id).toBe("part-502"));
  rerender({ open: true, search: "missing", page: 0, selectedId: "part-502" });
  await waitFor(() => expect(result.current.pageQuery.data?.totalCount).toBe(0));
  expect(result.current.selectedQuery.data?.id).toBe("part-502");
  state.selectedStock = 0;
  await act(async () => { await client.invalidateQueries({ queryKey: ["parts_inventory"] }); });
  await waitFor(() => expect(result.current.selectedQuery.data?.stock_quantity).toBe(0));
});
it("separates organization cache and propagates permission/network failures without fallback", async () => {
  const { result, rerender } = mount();
  await waitFor(() => expect(result.current.pageQuery.isSuccess).toBe(true));
  state.organization = "b"; state.identity = "user:b"; state.fail = true;
  rerender({ open: true, search: "", page: 0, selectedId: null });
  expect(result.current.pageQuery.data).toBeUndefined();
  await waitFor(() => expect(result.current.pageQuery.isError).toBe(true));
  state.fail = false;
  await act(async () => { await result.current.pageQuery.refetch(); });
  await waitFor(() => expect(result.current.pageQuery.data?.items[0]?.organization_id).toBe("b"));
});
it("rejects a response violating positive stock instead of showing ineligible options", async () => {
  state.invalidStock = true;
  const { result } = mount();
  await waitFor(() => expect(result.current.pageQuery.isError).toBe(true));
  expect(result.current.pageQuery.error?.message).toContain("disponibilidad");
  expect(result.current.pageQuery.data).toBeUndefined();
});
