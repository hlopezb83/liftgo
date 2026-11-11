import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock, type ChainCall } from "@/test/helpers/supabaseChain";
import { createInvoiceListFilters, type InvoiceCfdiFilter } from "../../../lib/invoiceListFilters";
import { useInvoicesInfinite } from "../invoiceQueries";

let requests: ChainCall[][] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ tableResolvers: {
    invoices: (calls) => {
      requests.push(calls);
      const from = calls.find((call) => call.method === "range")?.args[0];
      return { data: from === 0 ? Array.from({ length: 100 }, (_, i) => ({ id: `fixture-${i}` })) : [], error: null };
    },
  } }),
}));

const cases: { filter: InvoiceCfdiFilter; fiscal: [string, ...unknown[]][] }[] = [
  { filter: "cancelled", fiscal: [["or", "cfdi_status.eq.cancelled,cancellation_status.eq.accepted"]] },
  { filter: "cancellation_pending", fiscal: [["eq", "cancellation_status", "pending"], ["or", "cfdi_status.is.null,cfdi_status.neq.cancelled"]] },
  ...(["stamped", "stamping", "error"] as const).map((filter) => ({ filter, fiscal: [
    ["eq", "cfdi_status", filter], ["or", "cancellation_status.is.null,cancellation_status.not.in.(accepted,pending)"],
  ] as [string, ...unknown[]][] })),
  { filter: "pending", fiscal: [
    ["or", "cancellation_status.is.null,cancellation_status.not.in.(accepted,pending)"],
    ["or", "cfdi_status.is.null,cfdi_status.eq.pending"],
  ] },
];

describe("effective fiscal filter is applied remotely before every page", () => {
  beforeEach(() => { requests = []; });
  it.each(cases)("$filter preserves all filters on the next page", async ({ filter, fiscal }) => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useInvoicesInfinite(createInvoiceListFilters({
      cfdi: filter, status: "partial", search: "QA", from: "2026-01-01", to: "2026-12-31",
    })), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => { await result.current.fetchNextPage(); });
    expect(requests).toHaveLength(2);
    for (const [index, calls] of requests.entries()) {
      const filters = calls.filter((call) => ["eq", "or", "gte", "lte"].includes(call.method)).map((call) => [call.method, ...call.args]);
      expect(filters).toEqual([
        ["or", "is_e2e.is.null,is_e2e.eq.false"], ["eq", "status", "partial"], ...fiscal,
        ["gte", "issued_at", "2026-01-01"], ["lte", "issued_at", "2026-12-31"],
        ["or", "invoice_number.ilike.%QA%,customer_name.ilike.%QA%"],
      ]);
      const rangeIndex = calls.findIndex((call) => call.method === "range");
      expect(calls[rangeIndex].args).toEqual([index * 100, index * 100 + 99]);
      expect(calls.slice(rangeIndex + 1).every((call) => !["eq", "or"].includes(call.method))).toBe(true);
    }
    await waitFor(() => expect(result.current.hasNextPage).toBe(false));
  });
});
