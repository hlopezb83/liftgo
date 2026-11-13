import { QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { parseDeliveriesPage, type DeliveriesPageRpcArgs } from "../../lib/deliveriesPageRpc";
import { deliveriesPageOptions, useDeliveriesPage } from "../useDeliveriesPage";

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
const filters = { search: "", type: "all", status: "all", history: "all", pageIndex: 0, pageSize: 25, sorting: [] };
const args: DeliveriesPageRpcArgs = {
  p_expected_organization_id: state.org, p_search: null, p_type: "all", p_status: "all", p_history: "all", p_page: 0, p_page_size: 25, p_sort: [],
};
const row = {
  id: "30000000-0000-4000-8000-000000000001", organization_id: state.org, booking_id: null,
  forklift_id: "40000000-0000-4000-8000-000000000001", delivery_number: "ENT-1", type: "pickup",
  address: null, scheduled_date: "2026-11-09", scheduled_time: null, status: "in_transit", driver_name: null,
  forklifts: { name: "Unidad A", model: null }, historical_reconciliation: null,
};
const page = { items: [row], totalCount: 1, overdueCount: 602, pageIndex: 0, today: "2026-11-10" };
beforeEach(() => {
  state.allowed = true; state.org = args.p_expected_organization_id; state.user = "20000000-0000-4000-8000-000000000001";
  state.rpc.mockReset(); state.signal.mockReset();
  state.signal.mockResolvedValue({ data: page, error: null });
  state.rpc.mockReturnValue({ abortSignal: state.signal });
});

it("uses one bounded RPC with tenant assertion and forwards cancellation", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  expect(await client.fetchQuery(deliveriesPageOptions(state.org, state.user, filters, true))).toEqual(page);
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("get_deliveries_page", args);
  expect(state.signal).toHaveBeenCalledWith(expect.any(AbortSignal));
  client.clear();
});

it("isolates cache by user, company and permission, under existing delivery invalidations", () => {
  const baseline = deliveriesPageOptions(state.org, state.user, filters, true);
  expect(baseline.queryKey.slice(0, 2)).toEqual(["deliveries", "list"]);
  expect(deliveriesPageOptions("another-org", state.user, filters, true).queryKey).not.toEqual(baseline.queryKey);
  expect(deliveriesPageOptions(state.org, "another-user", filters, true).queryKey).not.toEqual(baseline.queryKey);
  expect(deliveriesPageOptions(state.org, state.user, filters, false).queryKey).not.toEqual(baseline.queryKey);
});

it("does not request or expose cached data after losing permission", async () => {
  const { Wrapper } = createQueryWrapper();
  const { result, rerender } = renderHook(() => useDeliveriesPage(filters), { wrapper: Wrapper });
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
  await expect(client.fetchQuery(deliveriesPageOptions(state.org, state.user, filters, true))).rejects.toMatchObject({ code: "42501" });
  client.clear();
});

describe("page response verification", () => {
  it("accepts a coherent empty or clamped last page", () => {
    expect(parseDeliveriesPage({ ...page, items: [], totalCount: 0 }, args).totalCount).toBe(0);
    expect(parseDeliveriesPage(page, { ...args, p_page: 99 }).pageIndex).toBe(0);
  });
  it.each([
    { ...page, items: [] },
    { ...page, items: [row, row], totalCount: 2 },
    { ...page, pageIndex: 1 },
    { ...page, items: [{ ...row, organization_id: "10000000-0000-4000-8000-000000000002" }] },
    { ...page, overdueCount: -1 },
    { ...page, overdueCount: undefined },
    { ...page, items: [{ ...row, historical_reconciliation: { revoked_at: null } }] },
    { ...page, items: [{ ...row, status: "unknown" }] },
  ])("rejects inconsistent rows/counts and tenant/state mismatches", (invalid) => {
    expect(() => parseDeliveriesPage(invalid, args)).toThrow();
  });
});

it("normalizes filter inputs and isolates historical views in cache", () => {
  const normal = deliveriesPageOptions(state.org, state.user, filters, true);
  const history = deliveriesPageOptions(state.org, state.user, { ...filters, history: "history" }, true);
  expect(history.queryKey).not.toEqual(normal.queryKey);
  const filtered = deliveriesPageOptions(state.org, state.user, { ...filters, history: "reconciled", status: "completed", sorting: [{ id: "status", desc: true }, { id: "status", desc: false }, { id: "unknown", desc: true }] }, true);
  expect(filtered.queryKey.at(-1)).toMatchObject({ p_history: "reconciled", p_status: "completed", p_sort: [{ id: "status", desc: true }] });
});

it("accepts completed/future transports in the general history and rejects rows outside requested filters", () => {
  const future = { ...row, status: "completed", scheduled_date: "2026-12-01" };
  expect(parseDeliveriesPage({ ...page, items: [future] }, args).items[0].status).toBe("completed");
  expect(() => parseDeliveriesPage(page, { ...args, p_status: "completed" })).toThrow();
  expect(() => parseDeliveriesPage(page, { ...args, p_type: "delivery" })).toThrow();
  expect(() => parseDeliveriesPage(page, { ...args, p_history: "reconciled" })).toThrow();
});

it("validates complete active/revoked history and accepts a legitimate zero overdue count", () => {
  const ledger = {
    delivery_id: row.id, organization_id: row.organization_id, classification: "closed_rental",
    reference_date: "2026-11-09", date_basis: "booking_start_authorized", evidence: {},
    reason: "Authorized historical record", authorization_source: "QA fixture",
    reconciled_at: "2026-11-10T12:00:00+00:00", revoked_at: null, revocation_reason: null,
  };
  const active = { ...page, overdueCount: 0, items: [{ ...row, historical_reconciliation: ledger }] };
  expect(parseDeliveriesPage(active, { ...args, p_history: "reconciled" }).overdueCount).toBe(0);
  expect(() => parseDeliveriesPage(active, args)).toThrow();
  const revoked = { ...active, items: [{ ...row, historical_reconciliation: { ...ledger, revoked_at: "2026-11-11T12:00:00Z", revocation_reason: "Correction" } }] };
  expect(parseDeliveriesPage(revoked, args).items).toHaveLength(1);
  expect(() => parseDeliveriesPage(revoked, { ...args, p_history: "reconciled" })).toThrow();
  expect(() => parseDeliveriesPage({ ...active, items: [{ ...row, historical_reconciliation: { ...ledger, delivery_id: "30000000-0000-4000-8000-000000000002" } }] }, { ...args, p_history: "history" })).toThrow();
});
