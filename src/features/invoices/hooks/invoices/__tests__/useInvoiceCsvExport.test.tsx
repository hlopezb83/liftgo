import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ identity: "user-a:org-a", org: "org-a", allowed: true, fetch: vi.fn(), save: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => state.identity }));
vi.mock("@/contexts/OrganizationContext", () => ({ useVerifiedOrganizationId: () => state.org }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => state.allowed }));
vi.mock("../invoiceQueries", () => ({ fetchInvoicesForExport: state.fetch }));
vi.mock("@/lib/exportCsv", () => ({ exportToCsvGuarded: state.save }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: state.error }));
import { useInvoiceCsvExport } from "../useInvoiceCsvExport";
import { createInvoiceListFilters } from "../../../lib/invoiceListFilters";
const filters = createInvoiceListFilters();
const invoice = { invoice_number: "A-private", total: 116, moneda: "MXN", status: "sent" };
let resolve: (value: unknown[]) => void;
beforeEach(() => {
  state.identity = "user-a:org-a"; state.org = "org-a"; state.allowed = true;
  state.fetch.mockReset(); state.save.mockReset(); state.error.mockReset();
  state.fetch.mockReturnValue(new Promise(r => { resolve = r; }));
});
afterEach(cleanup);
it("saves complete ordinary export, scoped and abortable, with one job per repeated click", async () => {
  const { result } = renderHook(() => useInvoiceCsvExport(filters));
  let work: Promise<void>;
  act(() => { work = result.current.download(); void result.current.download(); });
  expect(state.fetch).toHaveBeenCalledTimes(1);
  expect(state.fetch.mock.calls[0][1]).toEqual({ organizationId: "org-a", signal: expect.any(AbortSignal) });
  await act(async () => { resolve([invoice]); await work; });
  expect(state.save).toHaveBeenCalledTimes(1); expect(result.current.busy).toBe(false);
});
it.each(["unmount", "identity", "organization", "permission", "filters", "ABA"])("discards pending work on %s", async (change) => {
  const view = renderHook(({ search }) => useInvoiceCsvExport(createInvoiceListFilters({ search })), { initialProps: { search: "" } });
  let work: Promise<void>;
  act(() => { work = view.result.current.download(); });
  const signal = state.fetch.mock.calls[0][1].signal as AbortSignal;
  if (change === "unmount") view.unmount();
  else {
    if (change === "identity") state.identity = "user-b:org-a";
    if (change === "organization" || change === "ABA") state.org = "org-b";
    if (change === "permission") state.allowed = false;
    view.rerender({ search: change === "filters" ? "new" : "" });
    if (change === "ABA") { state.org = "org-a"; view.rerender({ search: "" }); }
  }
  expect(signal.aborted).toBe(true);
  await act(async () => { resolve([invoice]); await work; });
  expect(state.save).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled();
});
it("an old completion cannot release a new export", async () => {
  const view = renderHook(() => useInvoiceCsvExport(filters));
  let first: Promise<void>;
  act(() => { first = view.result.current.download(); });
  const firstResolve = resolve;
  state.org = "org-b"; view.rerender();
  state.fetch.mockReturnValue(new Promise(r => { resolve = r; }));
  let second: Promise<void>; act(() => { second = view.result.current.download(); });
  await act(async () => { firstResolve([invoice]); await first; });
  expect(view.result.current.busy).toBe(true); expect(state.save).not.toHaveBeenCalled();
  await act(async () => { resolve([invoice]); await second; });
  expect(view.result.current.busy).toBe(false); expect(state.save).toHaveBeenCalledTimes(1);
});
it("reports failure and permits a fresh retry", async () => {
  state.fetch.mockRejectedValueOnce(new Error("network"));
  const { result } = renderHook(() => useInvoiceCsvExport(filters));
  await act(async () => { await result.current.download(); });
  expect(state.error).toHaveBeenCalledTimes(1); expect(result.current.busy).toBe(false);
  state.fetch.mockResolvedValueOnce([invoice]);
  await act(async () => { await result.current.download(); });
  expect(state.save).toHaveBeenCalledTimes(1);
});

it.each(["identity", "organization", "permission"])("fails closed before starting without %s", async (missing) => {
  if (missing === "identity") state.identity = "";
  if (missing === "organization") state.org = "";
  if (missing === "permission") state.allowed = false;
  const { result } = renderHook(() => useInvoiceCsvExport(filters));
  await act(async () => { await result.current.download(); });
  expect(state.fetch).not.toHaveBeenCalled(); expect(state.save).not.toHaveBeenCalled();
});
