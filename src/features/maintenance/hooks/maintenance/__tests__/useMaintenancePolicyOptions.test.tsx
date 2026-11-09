import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMaintenancePolicyOptions } from "../useMaintenancePolicyOptions";

const state = vi.hoisted(() => ({
  organization: { status: "ready", organizationId: "org-a", memberType: "internal" } as Record<string, string>,
  identity: "user-a:org-a:internal" as string | null,
  fetch: vi.fn(), requests: [] as URL[],
}));
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganizationContext: () => state.organization }));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => state.identity }));
vi.mock("@/features/availability", async () => import("@/features/availability/utils/fleetAvailability"));
vi.mock("@/features/bookings", async () => import("@/features/bookings/lib/queryKeys"));
vi.mock("@/features/fleet", async () => import("@/features/fleet/lib/queryKeys"));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("http://127.0.0.1:54321", "test-offline", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args: Parameters<typeof fetch>) => state.fetch(...args) },
  }) };
});

type Row = { id: string; organization_id: string; [key: string]: string | boolean | null };
let db: Record<string, Row[]>;
let cap = 200;
let failTable: string | undefined;
let failAfter: string | undefined;
const id = (number: number) => String(number).padStart(5, "0");
const fleet = (number: number, status = "available"): Row => ({ id: id(number), organization_id: "org-a", name: `Equipo ${id(number)}`, model: "QA", status, deleted_at: null, is_e2e: false });
const booking = (number: number, forklift = number): Row => ({ id: id(number), organization_id: "org-a", forklift_id: id(forklift), status: "confirmed", start_date: "2025-01-01", end_date: "2026-12-31", is_e2e: false });
const policy = (number: number, forklift = number): Row => ({ id: id(number), organization_id: "org-a", forklift_id: id(forklift), is_active: false });
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  state.organization = { status: "ready", organizationId: "org-a", memberType: "internal" };
  state.identity = "user-a:org-a:internal";
  state.requests = [];
  db = { forklifts: [], bookings: [], maintenance_policies: [] };
  cap = 200; failTable = undefined; failAfter = undefined;
  state.fetch.mockReset().mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    state.requests.push(url);
    const table = url.pathname.split("/").at(-1)!;
    const p = url.searchParams;
    if (table === failTable && (!failAfter || p.get("id") === `gt.${failAfter}`)) return json({ message: "permission denied", code: "42501" }, 403);
    const matchesDates = (row: Row) => {
      if (p.get("start_date") && String(row.start_date) > p.get("start_date")!.slice(4)) return false;
      if (p.get("end_date") && String(row.end_date) < p.get("end_date")!.slice(4)) return false;
      return true;
    };
    const rows = db[table].filter((row) => {
      if (p.get("organization_id") !== `eq.${row.organization_id}`) return false;
      if (p.get("id") && row.id <= p.get("id")!.slice(3)) return false;
      if (p.get("deleted_at") === "is.null" && row.deleted_at !== null) return false;
      if (p.get("or")?.includes("is_e2e.eq.false") && !p.get("or")?.includes("is_e2e.eq.true") && row.is_e2e === true) return false;
      if (p.get("status") && p.get("status") !== `eq.${row.status}`) return false;
      return matchesDates(row);
    }).sort((a, b) => a.id.localeCompare(b.id)).slice(0, Math.min(cap, Number(p.get("limit"))));
    return json(rows.map((row) => Object.fromEntries(p.get("select")!.split(",").map((key) => [key.trim(), row[key.trim()]]))));
  });
});
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; localStorage.clear(); });

describe("maintenance policy options, actual PostgREST transport offline", () => {
  it("reads 601 fleet/bookings and 503 policies completely, even with a lower API cap", async () => {
    cap = 73;
    db.forklifts = Array.from({ length: 601 }, (_, i) => fleet(i + 1));
    db.bookings = Array.from({ length: 601 }, (_, i) => booking(i + 1));
    db.maintenance_policies = Array.from({ length: 503 }, (_, i) => policy(i + 1));
    // This older active booking must survive 501 newer, future bookings.
    db.bookings.push(...Array.from({ length: 502 }, (_, i) => ({ ...booking(1000 + i), start_date: "2027-01-01", end_date: "2027-12-31" })));
    db.forklifts.push({ ...fleet(9000, "rented"), organization_id: "org-b" });
    db.bookings.push({ ...booking(9000, 601), organization_id: "org-b" });
    db.maintenance_policies.push({ ...policy(9000, 601), organization_id: "org-b" });
    const { result } = renderHook(() => useMaintenancePolicyOptions("2026-11-08", null, true), setup());
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.data).toHaveLength(98);
    expect(result.current.data?.map((row) => row.id)).toContain(id(601));
    expect(result.current.data?.map((row) => row.id)).not.toContain(id(503));
    for (const url of state.requests) {
      expect(url.searchParams.get("organization_id")).toBe("eq.org-a");
      expect(url.searchParams.get("order")).toBe("id.asc");
      expect(url.searchParams.get("limit")).toBe("200");
      expect(url.searchParams.get("offset")).toBeNull();
      expect(url.searchParams.get("select")).not.toContain("*");
      if (url.pathname.endsWith("bookings")) {
        expect(url.searchParams.get("status")).toBe("eq.confirmed");
        expect(url.searchParams.get("start_date")).toBe("lte.2026-11-08");
        expect(url.searchParams.get("end_date")).toBe("gte.2026-11-08");
      }
    }
  });

  it("preserves physical states, inclusive today, E2E/deleted filters and the edited policy exception", async () => {
    db.forklifts = [fleet(1, "rented"), fleet(2), fleet(3, "maintenance"), fleet(4, "retired"), fleet(5, "sold"), fleet(6), fleet(7), { ...fleet(8, "rented"), deleted_at: "2026-01-01" }, { ...fleet(9, "rented"), is_e2e: true }, fleet(10), fleet(11), fleet(12)];
    db.bookings = [2, 3, 4, 5].map((i) => ({ ...booking(i), start_date: "2026-11-08", end_date: "2026-11-08" }));
    db.bookings.push({ ...booking(6), status: "completed" }, { ...booking(7), status: "cancelled" }, { ...booking(10), status: "draft" }, { ...booking(11), end_date: "2026-11-07" }, { ...booking(12), is_e2e: true });
    db.maintenance_policies = [policy(3), policy(20, 1)];
    const { result, rerender } = renderHook(({ edit }) => useMaintenancePolicyOptions("2026-11-08", edit, true), { ...setup(), initialProps: { edit: null as string | null } });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.data?.map((row) => row.id)).toEqual([id(2)]);
    rerender({ edit: id(3) });
    expect(result.current.data?.map((row) => row.id)).toEqual([id(2), id(3)]);
  });

  it.each(["forklifts", "bookings", "maintenance_policies"])("fails closed if a later %s page fails", async (table) => {
    db.forklifts = [fleet(1, "rented"), fleet(2)];
    db.bookings = [booking(1), booking(2)];
    db.maintenance_policies = [policy(1, 90), policy(2, 91)];
    cap = 1; failTable = table; failAfter = id(1);
    const { result } = renderHook(() => useMaintenancePolicyOptions("2026-11-08", null, true), setup());
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isReady).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("hides cached options during refetch and after its failure, then recovers on retry", async () => {
    db.forklifts = [fleet(1, "rented")];
    const { result } = renderHook(() => useMaintenancePolicyOptions("2026-11-08", null, true), setup());
    await waitFor(() => expect(result.current.isReady).toBe(true));
    failTable = "bookings";
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    failTable = undefined;
    let retry: Promise<unknown>;
    act(() => { retry = result.current.refetch(); });
    await act(async () => { await retry; });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });

  it("invalidates with booking mutations and hides cached options until revalidation completes", async () => {
    db.forklifts = [fleet(1, "rented")];
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useMaintenancePolicyOptions("2026-11-08", null, true), { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    let release!: (value: Response) => void;
    state.fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
    let refresh!: Promise<void>;
    act(() => { refresh = client.invalidateQueries({ queryKey: ["bookings", "list"] }); });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isReady).toBe(false);
    await act(async () => { release(json([])); await refresh; });
    await waitFor(() => expect(result.current.isReady).toBe(true));
  });

  it("aborts in-flight reads when the selector unmounts", async () => {
    const signals: AbortSignal[] = [];
    state.fetch.mockImplementation((_input, init: RequestInit) => new Promise((_resolve, reject) => {
      const signal = init.signal!;
      signals.push(signal);
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const { result, unmount } = renderHook(() => useMaintenancePolicyOptions("2026-11-08", null, true), setup());
    await waitFor(() => expect(signals).toHaveLength(3));
    expect(result.current.data).toBeUndefined();
    unmount();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("isolates cache by identity/organization, and never reads when context is unverified or closed", async () => {
    db.forklifts = [fleet(1, "rented"), { ...fleet(2, "rented"), organization_id: "org-b" }];
    const { result, rerender } = renderHook(({ open }) => useMaintenancePolicyOptions("2026-11-08", null, open), { ...setup(), initialProps: { open: true } });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    state.organization = { status: "loading" }; state.identity = null;
    const count = state.requests.length;
    rerender({ open: true });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isReady).toBe(false);
    expect(state.requests).toHaveLength(count);
    state.organization = { status: "ready", organizationId: "org-b", memberType: "internal" }; state.identity = "user-b:org-b:internal";
    rerender({ open: true });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.data?.map((row) => row.id)).toEqual([id(2)]);
    rerender({ open: false });
    expect(result.current.data).toBeUndefined();
  });

  it("fails closed at the request budget instead of looping or exposing a partial list", async () => {
    cap = 1;
    db.forklifts = Array.from({ length: 502 }, (_, i) => fleet(i + 1, "rented"));
    const { result } = renderHook(() => useMaintenancePolicyOptions("2026-11-08", null, true), setup());
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(state.requests.filter((url) => url.pathname.endsWith("forklifts"))).toHaveLength(251);
    expect(result.current.data).toBeUndefined();
    expect(result.current.isReady).toBe(false);
    expect(result.current.limitMessage).toContain("demasiado grande");
  });

  it("fails closed at the row budget even if an API ignores the requested page size", async () => {
    state.fetch.mockImplementation(async () => json(Array.from({ length: 50_001 }, (_, i) => ({ id: id(i + 1), organization_id: "org-a" }))));
    const { result } = renderHook(() => useMaintenancePolicyOptions("2026-11-08", null, true), setup());
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(state.fetch).toHaveBeenCalledTimes(3);
    expect(result.current.data).toBeUndefined();
    expect(result.current.isReady).toBe(false);
    expect(result.current.limitMessage).toContain("No se mostraron resultados parciales");
  });

  it.each([null, [{ organization_id: "org-a" }], [fleet(1), fleet(1)]])("rejects invalid or non-advancing payloads: %j", async (payload) => {
    state.fetch.mockImplementation(async () => json(payload));
    const { result } = renderHook(() => useMaintenancePolicyOptions("2026-11-08", null, true), setup());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isReady).toBe(false);
  });

  it("rejects an unexpected cross-tenant response instead of trusting client filters", async () => {
    state.fetch.mockResolvedValue(json([{ ...fleet(1), organization_id: "org-b" }]));
    const { result } = renderHook(() => useMaintenancePolicyOptions("2026-11-08", null, true), setup());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
