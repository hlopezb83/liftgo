import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { AppRole, PermissionsMap } from "@/features/users";

const state = vi.hoisted(() => ({
  userId: "user-a" as string | undefined, authLoading: false,
  organizationId: "org-a", orgStatus: "ready", role: "auditor" as AppRole | undefined,
  roleLoading: false, roleError: false, permissionsLoading: false, permissionsError: false,
  permissions: {} as PermissionsMap, requests: [] as URL[], payloads: [] as { p_expected_organization_id: string; p_query: string; p_sections: string[] }[],
  signals: [] as (AbortSignal | null | undefined)[], fetch: vi.fn(),
  failed: new Set<string>(), empty: new Set<string>(), holdCustomers: undefined as Promise<void> | undefined,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.userId ? { id: state.userId } : null, isLoading: state.authLoading }) }));
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganizationContext: () => ({ status: state.orgStatus, organizationId: state.organizationId }) }));
vi.mock("@/features/users", async (original) => ({
  ...await original<typeof import("@/features/users")>(),
  useUserRole: () => ({ data: state.role, isLoading: state.roleLoading, isError: state.roleError }),
  useRolePermissions: () => ({ data: state.permissions, isLoading: state.permissionsLoading, isError: state.permissionsError }),
}));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("http://127.0.0.1:54321", "offline", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args: Parameters<typeof fetch>) => state.fetch(...args) },
  }) };
});
import { useEntitySearch } from "../useEntitySearch";

const modules = ["Facturas", "Cotizaciones", "Clientes", "Reservas", "Entregas"];
const clients: QueryClient[] = [];
function permit(...allowed: string[]) {
  state.permissions = Object.fromEntries(["auditor", "ventas", "dispatcher"].map(role => [role,
    Object.fromEntries(modules.map(module => [module, allowed.includes(module) ? "read" : "none"])),
  ])) as PermissionsMap;
}
function mount(query: string | (() => string) = "445", enabled = true, debounce?: () => string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: debounce ? 30_000 : 0 } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useEntitySearch(typeof query === "function" ? query() : query, enabled, debounce?.()), { wrapper }), client };
}
const tables = () => state.requests.map(url => url.pathname.split("/").at(-1));

beforeEach(() => {
  state.userId = "user-a"; state.authLoading = false; state.organizationId = "org-a"; state.orgStatus = "ready";
  state.role = "auditor"; state.roleLoading = false; state.roleError = false; state.permissionsLoading = false; state.permissionsError = false;
  state.requests = []; state.failed = new Set(); state.empty = new Set(); state.holdCustomers = undefined; permit(...modules);
  state.payloads = [];
  state.signals = [];
  state.fetch.mockReset().mockImplementation(async (input: RequestInfo | URL, init: RequestInit) => {
    const url = new URL(String(input)); state.requests.push(url);
    state.signals.push(init.signal);
    const args = JSON.parse(String(init.body)); state.payloads.push(args);
    if (args.p_sections.includes("customers")) await state.holdCustomers;
    const data = { invoices: [], quotes: [], customers: [], bookings: [], deliveries: [], returns: [] } as Record<string, unknown>;
    const errors: Record<string, string> = {};
    for (const section of args.p_sections) {
      const table = section === "customers" ? "organization_customers" : section === "returns" ? "return_inspections" : section;
      if (state.failed.has(table) || (section === "quotes" && state.failed.has("quote-exact"))) {
        errors[section] = "No se pudo completar la búsqueda.";
      }
      if (state.failed.has(table) || (section === "quotes" && state.failed.has("quote-broad"))) continue;
      const id = state.userId + "-" + args.p_expected_organization_id + "-" + table;
      data[section] = state.empty.has(table) ? [] : [{ id, label: "QA 445", url: "/" + section + "/" + id }];
    }
    const failedAll = args.p_sections.every((section: string) => {
      const table = section === "customers" ? "organization_customers" : section;
      return state.failed.has(table) || (section === "quotes" && state.failed.has("quote-exact") && state.failed.has("quote-broad"));
    });
    if (failedAll) return new Response(JSON.stringify({ message: "No se pudo completar la búsqueda.", code: "55000" }), { status: 500 });
    if (Object.keys(errors).length) data.errors = errors;
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  });
});
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); });

describe("useEntitySearch: real QueryClient and SDK, simulated HTTP only", () => {
  it("returns fresh results before the debounce and waits for new terms and changed permissions", async () => {
    permit("Clientes");
    let term = "445";
    let debounced = "";
    const { result, rerender } = mount(() => term, true, () => debounced);
    expect(state.requests).toHaveLength(0);
    debounced = term; rerender();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    term = "other"; rerender();
    expect(result.current.data).toBeUndefined();
    expect(state.requests).toHaveLength(1);
    debounced = ""; term = "445"; rerender();
    expect(result.current.activeQuery).toBe(term);
    expect(result.current.data?.customers).toHaveLength(1);
    expect(state.requests).toHaveLength(1);
    permit("Reservas"); rerender();
    expect(result.current.data).toBeUndefined();
    expect(state.requests).toHaveLength(1);
  });
  it.each([
    ["Facturas", ["invoices"]], ["Clientes", ["customers"]], ["Reservas", ["bookings"]],
    ["Entregas", ["deliveries", "returns"]], ["Cotizaciones", ["quotes"]],
  ] as const)("requests only authorized %s sections in one explicitly scoped RPC", async (module, expected) => {
    permit(module);
    const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(tables()).toEqual(["get_global_search"]);
    expect(state.payloads).toEqual([{ p_expected_organization_id: "org-a", p_query: "445", p_sections: expected }]);
    expect(result.current.data?.errors).toBeUndefined();
  });

  it("requires invoice module access in addition to the financial exclusion", async () => {
    permit("Clientes");
    const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(tables()).toEqual(["get_global_search"]);
    expect(state.payloads[0].p_sections).toEqual(["customers"]);
    expect(result.current.data?.invoices).toEqual([]);
  });

  it("keeps dispatcher financial exclusion with stale/custom invoice permission", async () => {
    permit("Facturas", "Clientes"); state.role = "dispatcher";
    const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(tables()).toEqual(["get_global_search"]);
    expect(state.payloads[0].p_sections).toEqual(["customers"]);
  });

  it("with no authorized section makes no requests, including explicit refetch, and no invented error", async () => {
    permit();
    const { result } = mount();
    expect(result.current.canSearchEntities).toBe(false);
    expect(result.current.isResolvingAccess).toBe(false);
    expect(result.current.isFetching).toBe(false);
    await act(async () => { await result.current.refetch(); });
    expect(state.requests).toEqual([]);
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it.each(["roleLoading", "roleError", "permissionsLoading", "permissionsError"] as const)("fails closed with cached permission data while %s", async flag => {
    state[flag] = true;
    const { result } = mount();
    expect(result.current.canSearchEntities).toBe(false);
    expect(result.current.isResolvingAccess).toBe(flag.endsWith("Loading"));
    await act(async () => { await result.current.refetch(); });
    expect(state.requests).toEqual([]);
    expect(result.current.isError).toBe(false);
  });

  it.each(["loading", "error"])("requires a verified organization (%s), even on refetch", async status => {
    state.orgStatus = status;
    const { result } = mount();
    expect(result.current.canSearchEntities).toBe(false);
    await act(async () => { await result.current.refetch(); });
    expect(state.requests).toEqual([]);
  });

  it.each([false, true])("does not query with absent or loading identity (%s)", async loading => {
    state.authLoading = loading; if (!loading) state.userId = undefined;
    const { result } = mount();
    expect(result.current.canSearchEntities).toBe(false);
    await act(async () => { await result.current.refetch(); });
    expect(state.requests).toEqual([]);
  });

  it.each([["a", true], ["445", false]] as const)("closed/short search stays request-free including refetch (%s,%s)", async (query, enabled) => {
    const { result } = mount(query, enabled);
    await act(async () => { await result.current.refetch(); });
    expect(state.requests).toEqual([]);
  });

  it("isolates tenant, identity, effective role and every changed permission mask", async () => {
    permit("Clientes");
    const { result, rerender, client } = mount();
    await waitFor(() => expect(result.current.data?.customers[0]?.id).toBe("user-a-org-a-organization_customers"));
    state.organizationId = "org-b"; rerender();
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.customers[0]?.id).toBe("user-a-org-b-organization_customers"));
    state.userId = "user-b"; rerender();
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.customers[0]?.id).toBe("user-b-org-b-organization_customers"));
    state.role = "ventas"; rerender();
    await waitFor(() => expect(state.requests).toHaveLength(4));
    permit("Reservas"); rerender();
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.bookings[0]?.id).toBe("user-b-org-b-bookings"));
    expect(result.current.data?.customers).toEqual([]);
    const key = client.getQueryCache().getAll().at(-1)!.queryKey;
    expect(key).toContain("org-b"); expect(key).toContain("user-b"); expect(key).toContain("ventas");
    expect(key).toContainEqual({ invoices: false, quotes: false, customers: false, bookings: true, deliveries: false, returns: false });
  });

  it("does not expose a late revoked response after the permission mask changes", async () => {
    let release!: () => void;
    state.holdCustomers = new Promise(resolve => { release = resolve; }); permit("Clientes");
    const { result, rerender } = mount();
    await waitFor(() => expect(tables()).toEqual(["get_global_search"]));
    permit("Reservas"); rerender();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(state.signals[0]?.aborted).toBe(true);
    await act(async () => { release(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(result.current.data?.customers).toEqual([]);
    expect(result.current.data?.bookings).toHaveLength(1);
  });

  it("reuses equivalent terms and cancels the previous request when the term changes", async () => {
    let term = "  ACME ";
    let release!: () => void;
    state.holdCustomers = new Promise(resolve => { release = resolve; });
    permit("Clientes");
    const { result, rerender } = mount(() => term);
    await waitFor(() => expect(state.payloads.map(({ p_query }) => p_query)).toEqual(["acme"]));
    term = "acme"; rerender();
    expect(state.signals[0]?.aborted).toBe(false);
    expect(state.payloads).toHaveLength(1);
    term = "nuevo"; state.holdCustomers = undefined; rerender();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(state.signals[0]?.aborted).toBe(true);
    expect(state.payloads.map(({ p_query }) => p_query)).toEqual(["acme", "nuevo"]);
    await act(async () => { release(); });
  });

  it.each(modules)("revoking %s immediately hides its cached hits without issuing new requests", async module => {
    permit(module);
    const { result, rerender } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const count = state.requests.length;
    permit(); rerender();
    expect(result.current.canSearchEntities).toBe(false);
    expect(result.current.data).toBeUndefined();
    await act(async () => { await result.current.refetch(); });
    expect(state.requests).toHaveLength(count);
  });

  it("hides a previously cached result while authentication resolves", async () => {
    permit("Clientes");
    const { result, rerender } = mount();
    await waitFor(() => expect(result.current.data?.customers).toHaveLength(1));
    state.authLoading = true; rerender();
    expect(result.current.canSearchEntities).toBe(false);
    expect(result.current.isResolvingAccess).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(state.requests).toHaveLength(1);
  });

  it("a sole authorized failure is total, not hidden by skipped sections; revocation removes it", async () => {
    permit("Clientes"); state.failed.add("organization_customers");
    const { result, rerender } = mount();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(tables()).toEqual(["get_global_search"]);
    permit(); rerender();
    expect(result.current.canSearchEntities).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("an authorized empty response is success, even when another authorized section fails", async () => {
    permit("Clientes"); state.empty.add("organization_customers");
    const { result, rerender } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.customers).toEqual([]);
    expect(result.current.data?.errors).toBeUndefined();
    expect(tables()).toEqual(["get_global_search"]);
    permit("Clientes", "Reservas"); state.failed.add("bookings"); rerender();
    await waitFor(() => expect(result.current.data?.errors).toEqual({ bookings: "No se pudo completar la búsqueda." }));
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data?.customers).toEqual([]);
  });

  it("partial errors name only issued sections and retain authorized success", async () => {
    permit("Clientes", "Reservas"); state.failed.add("organization_customers");
    const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.errors).toEqual({ customers: "No se pudo completar la búsqueda." });
    expect(result.current.data?.bookings).toHaveLength(1);
    expect(tables()).toEqual(["get_global_search"]);
  });

  it("quote-only partial lookup failure is partial and both failures are total", async () => {
    permit("Cotizaciones"); state.failed.add("quote-exact");
    const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.errors).toEqual({ quotes: expect.any(String) });
    state.failed.add("quote-broad");
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(new Set(tables())).toEqual(new Set(["get_global_search"]));
  });
});
