import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { AppRole, PermissionsMap } from "@/features/users";

const state = vi.hoisted(() => ({
  userId: "user-a" as string | undefined, authLoading: false,
  organizationId: "org-a", orgStatus: "ready", role: "auditor" as AppRole | undefined,
  roleLoading: false, roleError: false, permissionsLoading: false, permissionsError: false,
  permissions: {} as PermissionsMap, requests: [] as URL[], fetch: vi.fn(),
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
function mount(query = "445", enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useEntitySearch(query, enabled), { wrapper }), client };
}
const tables = () => state.requests.map(url => url.pathname.split("/").at(-1));

beforeEach(() => {
  state.userId = "user-a"; state.authLoading = false; state.organizationId = "org-a"; state.orgStatus = "ready";
  state.role = "auditor"; state.roleLoading = false; state.roleError = false; state.permissionsLoading = false; state.permissionsError = false;
  state.requests = []; state.failed = new Set(); state.empty = new Set(); state.holdCustomers = undefined; permit(...modules);
  state.fetch.mockReset().mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(String(input)); state.requests.push(url);
    const table = url.pathname.split("/").at(-1)!;
    const organization = url.searchParams.get("organization_id")?.replace(/^eq\./, "");
    const id = `${state.userId}-${organization}-${table}`;
    if (table === "organization_customers") await state.holdCustomers;
    if (state.failed.has(table) || state.failed.has(url.searchParams.has("quote_number") ? "quote-exact" : "quote-broad")) {
      return new Response(JSON.stringify({ message: "private failure", code: "42501" }), { status: 403 });
    }
    const row = table === "organization_customers"
      ? { customer_id: id, customers: { id, name: "QA 445", rfc: "AAA010101AAA", deleted_at: null } }
      : { id, invoice_number: "FAC-445", booking_number: "RES-445", delivery_number: "DEL-445", inspection_number: "RET-445", quote_number: "COT-0445", customer_name: "QA 445" };
    return new Response(JSON.stringify(state.empty.has(table) ? [] : [row]), { headers: { "Content-Type": "application/json" } });
  });
});
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); });

describe("useEntitySearch: real QueryClient and SDK, simulated HTTP only", () => {
  it.each([
    ["Facturas", ["invoices"]], ["Clientes", ["organization_customers"]], ["Reservas", ["bookings"]],
    ["Entregas", ["deliveries", "return_inspections"]], ["Cotizaciones", ["quotes", "quotes"]],
  ] as const)("issues only authorized %s requests, all explicitly scoped", async (module, expected) => {
    permit(module);
    const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(tables()).toEqual(expected);
    for (const url of state.requests) {
      expect(url.searchParams.get("organization_id")).toBe("eq.org-a");
      expect(url.searchParams.get("limit")).toBe("5");
    }
    expect(result.current.data?.errors).toBeUndefined();
    expect(state.requests.some(url => url.pathname.endsWith("/customers"))).toBe(false);
    if (module === "Clientes") {
      expect(state.requests[0].searchParams.get("select")).toBe("customer_id,customers!inner(id,name,rfc,deleted_at)");
      expect(state.requests[0].searchParams.has("customers.organization_id")).toBe(false);
    }
  });

  it("requires invoice module access in addition to the financial exclusion", async () => {
    permit("Clientes");
    const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(tables()).toEqual(["organization_customers"]);
    expect(result.current.data?.invoices).toEqual([]);
  });

  it("keeps dispatcher financial exclusion with stale/custom invoice permission", async () => {
    permit("Facturas", "Clientes"); state.role = "dispatcher";
    const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(tables()).toEqual(["organization_customers"]);
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
    await waitFor(() => expect(tables()).toEqual(["organization_customers"]));
    permit("Reservas"); rerender();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => { release(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(result.current.data?.customers).toEqual([]);
    expect(result.current.data?.bookings).toHaveLength(1);
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
    expect(tables()).toEqual(["organization_customers"]);
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
    expect(tables()).toEqual(["organization_customers"]);
    permit("Clientes", "Reservas"); state.failed.add("bookings"); rerender();
    await waitFor(() => expect(result.current.data?.errors).toEqual({ bookings: "private failure" }));
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data?.customers).toEqual([]);
  });

  it("partial errors name only issued sections and retain authorized success", async () => {
    permit("Clientes", "Reservas"); state.failed.add("organization_customers");
    const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.errors).toEqual({ customers: "private failure" });
    expect(result.current.data?.bookings).toHaveLength(1);
    expect(tables()).toEqual(["organization_customers", "bookings"]);
  });

  it("quote-only partial lookup failure is partial and both failures are total", async () => {
    permit("Cotizaciones"); state.failed.add("quote-exact");
    const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.errors).toEqual({ quotes: expect.any(String) });
    state.failed.add("quote-broad");
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(new Set(tables())).toEqual(new Set(["quotes"]));
  });
});
