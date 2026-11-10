import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  failed: new Set<string>(), requests: [] as string[], hold: undefined as Promise<void> | undefined,
  grant: "read" as "read" | "none", fetch: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "qa-user" }, isLoading: false }) }));
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganizationContext: () => ({ status: "ready", organizationId: "org-a" }) }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("http://127.0.0.1:54321", "offline", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args: Parameters<typeof fetch>) => state.fetch(...args) },
  }) };
});
// Real useUserRole/useRolePermissions, QueryClient and SDK. Only HTTP is synthetic.
import { MODULES } from "@/features/users";
import { useEntitySearch } from "../useEntitySearch";

const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useEntitySearch("QA", true), { wrapper }), client };
}
const entityRequests = () => state.requests.filter(table => !["user_roles", "role_permissions"].includes(table));

beforeEach(() => {
  state.failed = new Set(); state.requests = []; state.hold = undefined; state.grant = "read";
  state.fetch.mockReset().mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1)!;
    state.requests.push(table);
    if (table === "user_roles" || table === "role_permissions") await state.hold;
    if (state.failed.has(table)) return new Response(JSON.stringify({ message: "private ACL diagnostic", code: "42501" }), { status: 403 });
    const data = table === "user_roles" ? [{ role: "auditor" }]
      : table === "role_permissions" ? MODULES.map(module => ({ role: "auditor", module, access_level: module === "Clientes" ? state.grant : "none" }))
        : [{ customer_id: "customer-a", customers: { id: "customer-a", name: "QA", rfc: null, deleted_at: null } }];
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  });
});
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); });

describe("useEntitySearch access recovery with real permission queries", () => {
  it.each([["user_roles"], ["role_permissions"], ["user_roles", "role_permissions"]])("blocks entities until failed sources recover: %j", async (...failed) => {
    failed.forEach(table => state.failed.add(table));
    const { result } = mount();
    await waitFor(() => expect(result.current.isAccessError).toBe(true));
    expect(result.current.canSearchEntities).toBe(false);
    expect(entityRequests()).toEqual([]);
    // Initial role retries must settle before the explicit user retry.
    await waitFor(() => expect(result.current.isResolvingAccess).toBe(false));
    state.failed.clear();
    let release!: () => void;
    state.hold = new Promise(resolve => { release = resolve; });
    let retry!: Promise<unknown>;
    act(() => { retry = result.current.retryAccess(); });
    await waitFor(() => expect(result.current.isResolvingAccess).toBe(true));
    expect(result.current.canSearchEntities).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(entityRequests()).toEqual([]);
    await act(async () => { release(); await retry; });
    await waitFor(() => expect(result.current.data?.customers).toHaveLength(1));
    expect(result.current.isAccessError).toBe(false);
    expect(result.current.canSearchEntities).toBe(true);
    expect(entityRequests()).toEqual(["organization_customers"]);
  });

  it("failed verification after a cached grant hides hits and recovery to none stays request-free", async () => {
    const { result, client } = mount();
    await waitFor(() => expect(result.current.data?.customers).toHaveLength(1));
    state.failed.add("role_permissions");
    await act(async () => { await client.refetchQueries({ queryKey: ["role_permissions"] }); });
    await waitFor(() => expect(result.current.isAccessError).toBe(true));
    expect(result.current.canSearchEntities).toBe(false);
    expect(result.current.data).toBeUndefined();
    const issued = entityRequests().length;
    await act(async () => { await result.current.retryAccess(); });
    expect(result.current.isAccessError).toBe(true);
    expect(entityRequests()).toHaveLength(issued);
    state.failed.clear(); state.grant = "none";
    await act(async () => { await result.current.retryAccess(); });
    await waitFor(() => expect(result.current.isAccessError).toBe(false));
    expect(result.current.canSearchEntities).toBe(false);
    expect(result.current.isResolvingAccess).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(entityRequests()).toHaveLength(issued);
  });
});
