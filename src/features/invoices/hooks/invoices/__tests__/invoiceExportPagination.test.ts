import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  from: vi.fn(), rows: [] as { id: string }[], cap: Infinity, failAt: Infinity,
  requests: [] as { from: number; to: number; orders: unknown[]; filters: unknown[] }[],
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: api.from } }));
import { createInvoiceListFilters } from "../../../lib/invoiceListFilters";
import { fetchInvoicesForExport } from "../invoiceQueries";

beforeEach(() => {
  api.requests = []; api.cap = Infinity; api.failAt = Infinity; api.from.mockReset();
  api.from.mockImplementation(() => {
    let from = 0, to = 0;
    const orders: unknown[] = [], filters: unknown[] = [];
    const query = {
      select: () => query,
      abortSignal: () => query,
      or: (...args: unknown[]) => { filters.push(["or", ...args]); return query; },
      eq: (...args: unknown[]) => { filters.push(["eq", ...args]); return query; },
      gte: (...args: unknown[]) => { filters.push(["gte", ...args]); return query; },
      lte: (...args: unknown[]) => { filters.push(["lte", ...args]); return query; },
      order: (...args: unknown[]) => { orders.push(args); return query; },
      range: (a: number, b: number) => { from = a; to = b; return query; },
      returns: async () => {
        api.requests.push({ from, to, orders, filters });
        return from >= api.failAt
          ? { data: null, error: new Error("export page unavailable") }
          : { data: api.rows.slice(from, Math.min(to + 1, from + api.cap)), error: null };
      },
    };
    return query;
  });
});

const scope = () => ({ organizationId: "org-a", signal: new AbortController().signal });

function rows(count: number) {
  api.rows = Array.from({ length: count }, (_, i) => ({ id: `invoice-${i}` }));
}

describe("QR04: complete invoice export", () => {
  it.each([0, 500, 9999, 10000, 10001])("exports all %i rows, including the former 10000 boundary", async (count) => {
    rows(count);
    const exported = await fetchInvoicesForExport(undefined, scope());
    expect(exported).toEqual(api.rows);
    expect(new Set(exported.map(row => row.id)).size).toBe(count);
    expect(api.requests.at(-1)?.from).toBe(count);
  });

  it("advances by actual rows when the server cap is smaller than requested", async () => {
    rows(251); api.cap = 100;
    expect(await fetchInvoicesForExport(undefined, scope())).toEqual(api.rows);
    expect(api.requests.map(request => request.from)).toEqual([0, 100, 200, 251]);
  });

  it("preserves every filter and the stable ordering on every page", async () => {
    rows(501);
    await fetchInvoicesForExport(createInvoiceListFilters({
      status: "sent", cfdi: "stamped", search: "Acme", from: "2026-10-01", to: "2026-10-20",
    }), scope());
    expect(api.requests).toHaveLength(3);
    for (const request of api.requests) {
      expect(request.orders).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
      expect(request.filters).toEqual([
        ["or", "is_e2e.is.null,is_e2e.eq.false"], ["eq", "status", "sent"],
        ["eq", "cfdi_status", "stamped"], ["gte", "issued_at", "2026-10-01"],
        ["lte", "issued_at", "2026-10-20"],
        ["or", "invoice_number.ilike.%Acme%,customer_name.ilike.%Acme%"],
        ["eq", "organization_id", "org-a"],
      ]);
    }
  });

  it("rejects instead of returning a partial file when a later page fails", async () => {
    rows(1001); api.failAt = 500;
    await expect(fetchInvoicesForExport(undefined, scope())).rejects.toThrow("export page unavailable");
    expect(api.requests.map(request => request.from)).toEqual([0, 500]);
  });
});

it("aborted before starting does not make a request", async () => {
  const abort = new AbortController(); abort.abort();
  await expect(fetchInvoicesForExport(undefined, { organizationId: "org-a", signal: abort.signal })).rejects.toThrow();
  expect(api.requests).toHaveLength(0);
});
it("aborted after a page never collects it or starts another page", async () => {
  const abort = new AbortController();
  api.from.mockImplementation(() => {
    const query = { select: () => query, or: () => query, eq: () => query, abortSignal: () => query,
      order: () => query, range: () => query, returns: async () => {
        abort.abort(); return { data: [{ id: "old-company" }], error: null };
      } };
    return query;
  });
  await expect(fetchInvoicesForExport(undefined, { organizationId: "org-a", signal: abort.signal })).rejects.toThrow();
  expect(api.from).toHaveBeenCalledTimes(1);
});
it("requires a verified company even before making a request", async () => {
  await expect(fetchInvoicesForExport(undefined, { organizationId: "", signal: new AbortController().signal })).rejects.toThrow("Empresa no verificada");
  expect(api.from).not.toHaveBeenCalled();
});
