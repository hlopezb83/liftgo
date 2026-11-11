import { QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { parseOverdueDeliveriesPage, type OverdueDeliveriesPageRpcArgs } from "../../lib/overdueDeliveriesPageRpc";
import { overdueDeliveriesPageOptions, useOverdueDeliveriesPage } from "../useOverdueDeliveriesPage";

const state = vi.hoisted(() => ({
  allowed: true,
  org: "10000000-0000-4000-8000-000000000001",
  user: "20000000-0000-4000-8000-000000000001",
  rpc: vi.fn(), signal: vi.fn(),
}));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => state.allowed }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user ? { id: state.user } : null }) }));
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganizationContext: () => ({ status: "ready", memberType: "internal", organizationId: state.org }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
const filters = { search: "", type: "all", status: "all", pageIndex: 0, pageSize: 25, sorting: [] };
const args: OverdueDeliveriesPageRpcArgs = {
  p_expected_organization_id: state.org, p_search: null, p_type: "all", p_status: "all", p_page: 0, p_page_size: 25, p_sort: [],
};
const row = {
  id: "30000000-0000-4000-8000-000000000001", organization_id: state.org, booking_id: null,
  forklift_id: "40000000-0000-4000-8000-000000000001", delivery_number: "ENT-1", type: "pickup",
  address: null, scheduled_date: "2026-11-09", scheduled_time: null, status: "in_transit", driver_name: null,
  forklifts: { name: "Unidad A", model: null },
};
const page = { items: [row], totalCount: 1, pageIndex: 0, today: "2026-11-10" };
beforeEach(() => {
  state.allowed = true; state.org = args.p_expected_organization_id; state.user = "20000000-0000-4000-8000-000000000001";
  state.rpc.mockReset(); state.signal.mockReset();
  state.signal.mockResolvedValue({ data: page, error: null });
  state.rpc.mockReturnValue({ abortSignal: state.signal });
});

it("uses one bounded RPC with tenant assertion and forwards cancellation", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  expect(await client.fetchQuery(overdueDeliveriesPageOptions(state.org, state.user, filters, true))).toEqual(page);
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("get_overdue_deliveries_page", args);
  expect(state.signal).toHaveBeenCalledWith(expect.any(AbortSignal));
  client.clear();
});

it("isolates cache by user, company and permission, under existing delivery invalidations", () => {
  const baseline = overdueDeliveriesPageOptions(state.org, state.user, filters, true);
  expect(baseline.queryKey.slice(0, 2)).toEqual(["deliveries", "list"]);
  expect(overdueDeliveriesPageOptions("another-org", state.user, filters, true).queryKey).not.toEqual(baseline.queryKey);
  expect(overdueDeliveriesPageOptions(state.org, "another-user", filters, true).queryKey).not.toEqual(baseline.queryKey);
  expect(overdueDeliveriesPageOptions(state.org, state.user, filters, false).queryKey).not.toEqual(baseline.queryKey);
});

it("does not request or expose cached data after losing permission", async () => {
  const { Wrapper } = createQueryWrapper();
  const { result, rerender } = renderHook(() => useOverdueDeliveriesPage(filters), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.data?.totalCount).toBe(1));
  state.allowed = false;
  rerender();
  expect(result.current.data).toBeUndefined();
  expect(result.current.isError).toBe(true);
  expect(state.rpc).toHaveBeenCalledTimes(1);
});

it("propagates RPC errors instead of fabricating an empty result", async () => {
  state.signal.mockResolvedValue({ data: null, error: { message: "Permission denied", code: "42501" } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await expect(client.fetchQuery(overdueDeliveriesPageOptions(state.org, state.user, filters, true))).rejects.toMatchObject({ code: "42501" });
  client.clear();
});

describe("page response verification", () => {
  it("accepts a coherent empty or clamped last page", () => {
    expect(parseOverdueDeliveriesPage({ ...page, items: [], totalCount: 0 }, args).totalCount).toBe(0);
    expect(parseOverdueDeliveriesPage(page, { ...args, p_page: 99 }).pageIndex).toBe(0);
  });
  it.each([
    { ...page, items: [] },
    { ...page, items: [row, row], totalCount: 2 },
    { ...page, pageIndex: 1 },
    { ...page, items: [{ ...row, organization_id: "10000000-0000-4000-8000-000000000002" }] },
    { ...page, items: [{ ...row, scheduled_date: "2026-11-10" }] },
    { ...page, items: [{ ...row, status: "completed" }] },
  ])("rejects inconsistent rows/counts and tenant/date/state mismatches", (invalid) => {
    expect(() => parseOverdueDeliveriesPage(invalid, args)).toThrow();
  });
});
