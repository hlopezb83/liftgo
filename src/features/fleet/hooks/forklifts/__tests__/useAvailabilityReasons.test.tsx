import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { forkliftKeys } from "../../../lib/queryKeys";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), user: { id: "u1" },
  organization: { status: "ready", organizationId: "a", memberType: "internal" },
  fleetRead: true, bookingRead: true,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganizationContext: () => mocks.organization }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: (module: string) => module === "Flota" ? mocks.fleetRead : mocks.bookingRead }));
vi.mock("../fetchAvailabilityReasons", () => ({ fetchAvailabilityReasons: (...args: unknown[]) => mocks.fetch(...args) }));
import { useAvailabilityReasons } from "../useAvailabilityReasons";

const dates = { from: new Date(2026, 9, 10), to: new Date(2026, 9, 12) };
const payload = { unavailable: [], reservableWhileRented: [], evidenceIncomplete: false };

beforeEach(() => {
  mocks.fetch.mockReset().mockResolvedValue(payload);
  mocks.user = { id: "u1" };
  mocks.organization = { status: "ready", organizationId: "a", memberType: "internal" };
  mocks.fleetRead = true; mocks.bookingRead = true;
});

describe("availability reasons query lifecycle", () => {
  it("loads lazily only for a verified company and Flota/read", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result, rerender } = renderHook(({ open }) => useAvailabilityReasons(dates, open), { wrapper: Wrapper, initialProps: { open: false } });
    expect(mocks.fetch).not.toHaveBeenCalled();
    rerender({ open: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.fetch).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "a", start: "2026-10-10", end: "2026-10-12", canReadBookings: true, signal: expect.any(AbortSignal) }));
  });
  it.each(["loading", "no-membership", "portal", "no-read"])("does not query with %s access", (state) => {
    if (state === "portal") mocks.organization.memberType = "portal";
    else if (state === "no-read") mocks.fleetRead = false;
    else mocks.organization.status = state;
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAvailabilityReasons(dates, true), { wrapper: Wrapper });
    expect(result.current.allowed).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("clears old company data immediately on a scope switch", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result, rerender } = renderHook(() => useAvailabilityReasons(dates, true), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(payload));
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    mocks.organization.organizationId = "b";
    rerender();
    expect(result.current.data).toBeUndefined();
    expect(result.current.isPending).toBe(true);
    expect(mocks.fetch).toHaveBeenLastCalledWith(expect.objectContaining({ organizationId: "b" }));
  });
  it("hides data after permission loss even if it was cached", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result, rerender } = renderHook(() => useAvailabilityReasons(dates, true), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(payload));
    mocks.fleetRead = false;
    rerender();
    expect(result.current.data).toBeUndefined();
  });
  it("existing booking/fleet list invalidations refresh evidence", async () => {
    const { Wrapper, queryClient } = createQueryWrapper();
    const { result } = renderHook(() => useAvailabilityReasons(dates, true), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    mocks.fetch.mockResolvedValue({ ...payload, evidenceIncomplete: true });
    await act(async () => { await queryClient.invalidateQueries({ queryKey: forkliftKeys.lists() }); });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.data?.evidenceIncomplete).toBe(true));
  });
  it("does not reuse stale booking evidence after read access changes", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result, rerender } = renderHook(() => useAvailabilityReasons(dates, true), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    mocks.bookingRead = false;
    rerender();
    await waitFor(() => expect(mocks.fetch).toHaveBeenLastCalledWith(expect.objectContaining({ canReadBookings: false })));
  });
  it("manual refresh also invalidates the canonical availability selector cache", async () => {
    const { Wrapper, queryClient } = createQueryWrapper();
    const canonicalKey = forkliftKeys.list({ available: true, startStr: "2026-10-10", endStr: "2026-10-12" });
    queryClient.setQueryDefaults(canonicalKey, { gcTime: Infinity });
    queryClient.setQueryData(canonicalKey, []);
    const { result } = renderHook(() => useAvailabilityReasons(dates, true), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => { await result.current.refresh(); });
    expect(queryClient.getQueryState(canonicalKey)?.isInvalidated).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
});
