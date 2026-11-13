import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseChainMock, type ChainCall, type SupabaseMockResponse } from "@/test/helpers/supabaseChain";
import { bookingSearchFilter } from "../../../lib/bookingSearchFilter";
import { bookingPageQueryOptions, type BookingPageFilters } from "../useBookingPage";

let requests: ChainCall[][] = [];
let responses: SupabaseMockResponse[] = [];
vi.mock("@/integrations/supabase/client", () => ({ supabase: createSupabaseChainMock({
  tableResolvers: { bookings: calls => {
    requests.push(calls);
    return responses.shift() ?? { data: [], count: 1001, error: null };
  } },
}) }));
const filters: BookingPageFilters = { q: "", status: "all", upcoming: false, pageIndex: 30, pageSize: 25, sorting: [] };
const query = (overrides: Partial<BookingPageFilters> = {}) => bookingPageQueryOptions("org-a", { ...filters, ...overrides });
beforeEach(() => { requests = []; responses = []; });

describe("booking pages", () => {
  it("preserves punctuation in customer names and quotes PostgREST values", async () => {
    await new QueryClient().fetchQuery(query({ q: " ACME S.A. de C.V., (Norte) " }));
    expect(requests[0]).toContainEqual({ method: "or", args: [
      'customer_name.ilike."%ACME S.A. de C.V., (Norte)%",booking_number.ilike."%ACME S.A. de C.V., (Norte)%"',
    ] });
  });

  it("treats underscore and percent in folios as literal characters", () => {
    expect(bookingSearchFilter("RES_100%")).toBe(String.raw`customer_name.ilike."%RES\\_100\\%%",booking_number.ilike."%RES\\_100\\%%"`);
  });

  it("uses a quoted literal regex for stars, quotes and backslashes", () => {
    const term = 'ACME* ("Norte")\\1';
    const filter = bookingSearchFilter(term);
    const encoded = filter.slice("customer_name.imatch.".length, filter.indexOf(",booking_number.imatch."));
    const pattern = JSON.parse(encoded) as string;
    expect(new RegExp(pattern, "i").test(term)).toBe(true);
    expect(new RegExp(pattern, "i").test('ACME algo ("Norte")\\1')).toBe(false);
  });

  it("reads beyond the former 500-row limit with exact count, org and stable ordering", async () => {
    const client = new QueryClient();
    responses.push({ data: [{ id: "booking-751" }], count: 1001, error: null });
    const data = await client.fetchQuery(query({ sorting: [{ id: "customer_name", desc: false }] }));
    expect(data).toEqual({ items: [{ id: "booking-751" }], totalCount: 1001, pageIndex: 30 });
    expect(requests[0]).toContainEqual({ method: "eq", args: ["organization_id", "org-a"] });
    expect(requests[0]).toContainEqual({ method: "select", args: ["*, forklifts(name, model)", { count: "exact", head: false }] });
    expect(requests[0].slice(-3)).toEqual([
      { method: "order", args: ["customer_name", { ascending: true, nullsFirst: false }] },
      { method: "order", args: ["id", { ascending: true }] },
      { method: "range", args: [750, 774] },
    ]);
  });

  it("recovers a deleted last page only after a successful exact count", async () => {
    responses = [
      { data: null, count: null, error: { code: "PGRST103", message: "Out of range" } },
      { data: null, count: 31, error: null },
      { data: [{ id: "last" }], count: 31, error: null },
    ];
    const data = await new QueryClient().fetchQuery(query());
    expect(data.pageIndex).toBe(1);
    expect(requests[1]).toContainEqual({ method: "select", args: ["*, forklifts(name, model)", { count: "exact", head: true }] });
    expect(requests[2]).toContainEqual({ method: "range", args: [25, 49] });
  });

  it("does not turn a failed count into page zero or an empty success", async () => {
    responses = [
      { data: null, count: null, error: { code: "PGRST103", message: "Out of range" } },
      { data: null, count: null, error: { message: "Network unavailable" } },
    ];
    await expect(new QueryClient().fetchQuery({ ...query(), retry: false })).rejects.toMatchObject({ message: "Network unavailable" });
    expect(requests).toHaveLength(2);
  });

  it("isolates caches by organization, page, search, status and sorting", () => {
    expect(query().queryKey).not.toEqual(bookingPageQueryOptions("org-b", filters).queryKey);
    for (const overrides of [{ pageIndex: 31 }, { q: "1001" }, { status: "cancelled" }, { sorting: [{ id: "forklift_name", desc: true }] }]) {
      expect(query().queryKey).not.toEqual(query(overrides).queryKey);
    }
    expect(bookingPageQueryOptions(undefined, filters).enabled).toBe(false);
  });
});
