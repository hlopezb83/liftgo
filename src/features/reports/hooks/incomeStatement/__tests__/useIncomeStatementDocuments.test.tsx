import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callRpc } from "@/lib/rpc";
import { useIncomeStatementDocuments } from "../useIncomeStatementDocuments";
const state = vi.hoisted(() => ({
  organizationId: "tenant-a" as string | undefined,
  userId: "user-a" as string | undefined,
  options: undefined as unknown as {
    enabled: boolean;
    queryKey: readonly unknown[];
    queryFn: (context: { signal: AbortSignal }) => Promise<unknown>;
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: state.userId ? { id: state.userId } : null }),
}));
vi.mock("@/contexts/OrganizationContext", () => ({
  useVerifiedOrganizationId: () => state.organizationId,
}));
vi.mock("@/lib/rpc", () => ({
  callRpc: vi
    .fn()
    .mockResolvedValue({ items: [], total_count: 0, total_amount: 0 }),
}));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (value: unknown) => value,
  useQuery: (options: typeof state.options) => {
    state.options = options;
    return {};
  },
}));
const scope = {
  startDate: "2026-09-01",
  endDate: "2026-10-31",
  accountingBasis: "cash" as const,
};
const selection = {
  kind: "other_services",
  label: "  Nombre exacto",
  title: "Cliente",
  months: ["2026-10"],
  expectedTotal: 100,
};
beforeEach(() => {
  state.organizationId = "tenant-a";
  state.userId = "user-a";
  vi.clearAllMocks();
});
describe("document query scope and cancellation", () => {
  it("uses real server pagination and retains the full report range for canonical dedup", async () => {
    renderHook(() => useIncomeStatementDocuments(scope, selection, 2));
    const abort = new AbortController();
    await state.options.queryFn({ signal: abort.signal });
    expect(callRpc).toHaveBeenCalledWith(
      "get_income_statement_documents",
      {
        p_start_date: "2026-09-01",
        p_end_date: "2026-10-31",
        p_basis: "cash",
        p_kind: "other_services",
        p_label: "  Nombre exacto",
        p_month_keys: ["2026-10"],
        p_limit: 25,
        p_offset: 50,
      },
      { signal: abort.signal },
    );
  });
  it("separates tenant and user caches and never starts without verified identity", () => {
    const view = renderHook(() =>
      useIncomeStatementDocuments(scope, selection, 0),
    );
    const first = JSON.stringify(state.options.queryKey);
    state.organizationId = "tenant-b";
    view.rerender();
    expect(JSON.stringify(state.options.queryKey)).not.toEqual(first);
    const tenant = JSON.stringify(state.options.queryKey);
    state.userId = "user-b";
    view.rerender();
    expect(JSON.stringify(state.options.queryKey)).not.toEqual(tenant);
    state.organizationId = undefined;
    view.rerender();
    expect(state.options.enabled).toBe(false);
    state.organizationId = "tenant-a";
    state.userId = undefined;
    view.rerender();
    expect(state.options.enabled).toBe(false);
  });
});
