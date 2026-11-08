import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ org: "a", fetch: vi.fn(), requests: [] as URL[], stock: 12, missing: false, wrong: false }));
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganizationContext: () => ({ status: "ready", organizationId: state.org }) }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("http://127.0.0.1:54321", "offline", { auth: { persistSession: false }, global: { fetch: (...args: Parameters<typeof fetch>) => state.fetch(...args) } }) };
});
import { useInventoryPart } from "../useInventoryPart";
beforeEach(() => {
  state.org = "a"; state.stock = 12; state.requests = []; state.missing = false; state.wrong = false;
  state.fetch.mockImplementation(async (url: string) => {
    const u = new URL(url); state.requests.push(u);
    return new Response(JSON.stringify(state.missing ? [] : [{ id: "p1", organization_id: state.wrong ? "other" : state.org, catalog_part_id: null, name: "QA", sku: "SKU", category: "Filtros", stock_quantity: state.stock, min_stock_level: 2, unit_cost: 5, location: null, is_active: true, created_at: "2026-01-01", updated_at: "2026-01-01" }]), { headers: { "content-type": "application/json" } });
  });
});
function mount() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; return { client, ...renderHook(() => useInventoryPart("p1"), { wrapper }) }; }
it("reads the selected ID under tenant and refreshes on root invalidation", async () => {
  const { result, client } = mount(); await waitFor(() => expect(result.current.data?.stock_quantity).toBe(12));
  expect(state.requests[0].searchParams.get("organization_id")).toBe("eq.a"); expect(state.requests[0].searchParams.get("id")).toBe("eq.p1");
  state.stock = 15; await client.invalidateQueries({ queryKey: ["parts_inventory"] }); await waitFor(() => expect(result.current.data?.stock_quantity).toBe(15));
});
it("removes previous organization data on tenant switch", async () => {
  const { result, rerender } = mount(); await waitFor(() => expect(result.current.data?.organization_id).toBe("a"));
  state.org = "b"; rerender(); expect(result.current.data).toBeUndefined(); await waitFor(() => expect(result.current.data?.organization_id).toBe("b"));
});
it("rejects tenant mismatch instead of returning actionable data", async () => { state.wrong = true; const { result } = mount(); await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.data).toBeUndefined(); });
it("does not retain a deactivated or invisible record", async () => { state.missing = true; const { result } = mount(); await waitFor(() => expect(result.current.data).toBeNull()); });
