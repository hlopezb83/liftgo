import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  financial: true, quotes: true, userId: "admin-id" as string | undefined,
  organizationId: "org-a", status: "ready", query: vi.fn(), moduleAccess: vi.fn(), from: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => { state.query(options); return options; } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.userId ? { id: state.userId } : null }) }));
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganizationContext: () => ({ status: state.status, organizationId: state.organizationId }) }));
vi.mock("@/features/users", () => ({
  useHasFinancialAccess: () => state.financial,
  useHasModuleAccess: (...args: unknown[]) => { state.moduleAccess(...args); return state.quotes; },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: state.from } }));
import { useEntitySearch } from "../useEntitySearch";

beforeEach(() => {
  state.financial = true; state.quotes = true; state.userId = "admin-id";
  state.organizationId = "org-a"; state.status = "ready";
  state.query.mockClear(); state.moduleAccess.mockClear(); state.from.mockReset();
  state.from.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "is", "or", "order"]) chain[method] = () => chain;
    chain.limit = () => Promise.resolve({ data: [], error: null });
    return chain;
  });
});

function options() {
  return state.query.mock.lastCall?.[0] as { queryKey: unknown[]; enabled: boolean; queryFn: () => Promise<unknown> };
}

describe("useEntitySearch — tenant, identidad y permisos", () => {
  it("separa cache por organización, identidad y ambos permisos sin perder operación", () => {
    const { rerender } = renderHook(() => useEntitySearch("ACME", true));
    expect(state.moduleAccess).toHaveBeenCalledWith("Cotizaciones", "read");
    const keys = [options().queryKey];
    expect(keys[0]).toEqual(["global-search", "org-a", "admin-id", true, true, "ACME"]);
    state.financial = false; rerender(); keys.push(options().queryKey);
    state.quotes = false; rerender(); keys.push(options().queryKey);
    state.userId = "dispatcher-id"; rerender(); keys.push(options().queryKey);
    state.organizationId = "org-b"; rerender(); keys.push(options().queryKey);
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(5);
    expect(options().enabled).toBe(true);
  });

  it("no consulta quotes sin permiso y lo retira de la clave al revocarlo", async () => {
    const { rerender } = renderHook(() => useEntitySearch("445", true));
    await options().queryFn();
    expect(state.from.mock.calls.filter(([table]) => table === "quotes")).toHaveLength(2);
    state.from.mockClear(); state.quotes = false; rerender();
    await options().queryFn();
    expect(state.from).not.toHaveBeenCalledWith("quotes");
    expect(state.from).toHaveBeenCalledWith("bookings");
  });

  it.each(["loading", "error"])("sin organización verificada (%s) no consulta, incluso en refetch", async (status) => {
    state.status = status;
    renderHook(() => useEntitySearch("445", true));
    expect(options().enabled).toBe(false);
    await options().queryFn();
    expect(state.from).not.toHaveBeenCalled();
  });

  it("sin usuario autenticado no consulta, incluso en refetch", async () => {
    state.userId = undefined;
    renderHook(() => useEntitySearch("445", true));
    expect(options().enabled).toBe(false);
    expect(options().queryKey).toContain("anonymous");
    await options().queryFn();
    expect(state.from).not.toHaveBeenCalled();
  });

  it.each([["a", true], ["445", false]] as const)("desactiva búsqueda corta o diálogo cerrado (%s, %s)", (query, enabled) => {
    renderHook(() => useEntitySearch(query, enabled));
    expect(options().enabled).toBe(false);
  });
});
