import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as { id: string; status: string; organization_id: string; start_date: string }[],
  calls: [] as { org?: string; states?: string[]; ids?: string[]; cursor?: string; visibility?: string }[],
  fullPages: false, failPage: -1, org: "org-a" as string | undefined, identity: "user:org-a:internal" as string | null,
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => options }));
vi.mock("@/contexts/OrganizationContext", () => ({ useVerifiedOrganizationId: () => state.org }));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => state.identity }));
vi.mock("@/features/bookings", async () => ({ bookingKeys: (await import("@/features/bookings/lib/queryKeys")).bookingKeys }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const filters: (typeof state.calls)[number] = {};
    const query = {
      select: () => query,
      eq: (_column: string, value: string) => { filters.org = value; return query; },
      or: (value: string) => { filters.visibility = value; return query; },
      in: (column: string, values: string[]) => { if (column === "status") filters.states = values; else filters.ids = values; return query; },
      order: () => query, limit: () => query,
      gt: (_column: string, value: string) => { filters.cursor = value; return query; },
      abortSignal: async () => {
        state.calls.push(filters);
        if (state.calls.length === state.failPage) return { data: null, error: new Error("page failed") };
        if (state.fullPages) return {
          data: Array.from({ length: 200 }, (_, i) => ({ id: String((state.calls.length - 1) * 200 + i).padStart(6, "0"),
            status: "confirmed", organization_id: "org-a", start_date: "2026-01-01" })), error: null,
        };
        return { data: state.rows.filter((r) => r.organization_id === filters.org &&
          (!filters.states || filters.states.includes(r.status)) && (!filters.ids || filters.ids.includes(r.id)) &&
          (!filters.cursor || r.id > filters.cursor)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 200), error: null };
      },
    };
    return query;
  },
} }));
import { fetchInvoiceBookingCandidates, useInvoiceBookingCandidates } from "../useInvoiceBookingCandidates";

const row = (n: number, status = "confirmed", organization_id = "org-a") => ({
  id: String(n).padStart(6, "0"), status, organization_id, start_date: "2026-01-01",
});
const read = (ids: string[] = [], signal = new AbortController().signal) =>
  fetchInvoiceBookingCandidates("org-a", "is_e2e.is.null,is_e2e.eq.false", ids, signal);
beforeEach(() => { state.rows = []; state.calls = []; state.fullPages = false; state.failPage = -1; state.org = "org-a"; state.identity = "user:org-a:internal"; });

describe("invoice booking candidates", () => {
  it("filters on the server and pages beyond 501 without losing old billable bookings", async () => {
    state.rows = [...Array.from({ length: 600 }, (_, i) => row(i, "cancelled")),
      ...Array.from({ length: 430 }, (_, i) => row(i + 600, i % 2 ? "completed" : "confirmed"))];
    const result = await read();
    expect(result).toHaveLength(430);
    expect(result.some((r) => r.id === "001029")).toBe(true);
    expect(new Set(result.map((r) => r.id)).size).toBe(430);
    expect(state.calls.map((c) => c.cursor)).toEqual([undefined, "000799", "000999"]);
    expect(state.calls.every((c) => c.states?.join() === "confirmed,completed")).toBe(true);
  });
  it("finishes an exact page boundary with an empty page", async () => {
    state.rows = Array.from({ length: 200 }, (_, i) => row(i));
    expect(await read()).toHaveLength(200);
    expect(state.calls).toHaveLength(2);
  });
  it("preserves linked cancelled records, deduplicates links, and scopes every read to the verified tenant", async () => {
    state.rows = [row(1), row(2, "cancelled"), row(3, "completed", "org-b"), row(4, "cancelled", "org-b")];
    expect((await read(["000001", "000002", "000002", "000004"])).map((r) => r.id)).toEqual(["000001", "000002"]);
    expect(state.calls[1].ids).toEqual(["000002", "000004"]);
    expect(state.calls.every((c) => c.org === "org-a" && c.visibility === "is_e2e.is.null,is_e2e.eq.false")).toBe(true);
    expect(state.calls[1].states).toBeUndefined();
  });
  it("rejects a later page failure instead of exposing partial candidates", async () => {
    state.rows = Array.from({ length: 250 }, (_, i) => row(i)); state.failPage = 2;
    await expect(read()).rejects.toThrow("page failed");
  });
  it("rejects historical-link recovery failures without returning otherwise complete candidates", async () => {
    state.rows = [row(1), row(2, "cancelled")]; state.failPage = 2;
    await expect(read(["000002"])).rejects.toThrow("page failed");
    expect(state.calls).toHaveLength(2);
    expect(state.calls[1]).toMatchObject({ org: "org-a", ids: ["000002"] });
    expect(state.calls[1].states).toBeUndefined();
  });
  it("fails closed after the page budget and does not attempt historical links", async () => {
    state.fullPages = true;
    await expect(read(["historical"])).rejects.toThrow("No se pudo consultar todas las reservas facturables");
    expect(state.calls).toHaveLength(500);
    expect(state.calls.every((call) => call.ids === undefined)).toBe(true);
    expect(state.calls[499].cursor).toBe("099799");
  });
  it("does not query without a verified organization or after cancellation", async () => {
    await expect(fetchInvoiceBookingCandidates("", "", [], new AbortController().signal)).rejects.toThrow("Empresa no verificada");
    const controller = new AbortController(); controller.abort();
    await expect(read([], controller.signal)).rejects.toThrow();
    expect(state.calls).toHaveLength(0);
  });
  it("separates tenant cache keys and disables unresolved identities", () => {
    const first = useInvoiceBookingCandidates(["b", "a", "a"]) as unknown as { queryKey: unknown[]; enabled: boolean };
    state.identity = "user:org-b:internal"; state.org = "org-b";
    const second = useInvoiceBookingCandidates(["a", "b"]) as unknown as typeof first;
    expect(first.queryKey).not.toEqual(second.queryKey);
    expect(first.queryKey.slice(0, 2)).toEqual(["bookings", "list"]);
    state.identity = null; state.org = undefined;
    expect((useInvoiceBookingCandidates([]) as unknown as typeof first).enabled).toBe(false);
  });
});
