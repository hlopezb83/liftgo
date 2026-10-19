import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useQuoteChargeAvailability } from "../useQuoteChargeAvailability";
const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, from } }));
const quoteId = "11111111-1111-4111-8111-111111111111";
const invoiceId = "22222222-2222-4222-8222-222222222222";
function setup(ids = [quoteId], currentInvoiceId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useQuoteChargeAvailability(ids, currentInvoiceId), { wrapper }), client };
}
afterEach(() => vi.clearAllMocks());
describe("useQuoteChargeAvailability", () => {
  it("excludes the invoice being edited and never scans a capped historical invoice list", async () => {
    rpc.mockResolvedValue({ data: { complete: true, quotes: [{ quote_id: quoteId, legacy_review_required: false, lines: [] }] }, error: null });
    const { result, client } = setup([quoteId, quoteId], invoiceId);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith("get_quote_charge_availability", { p_quote_ids: [quoteId], p_exclude_invoice_id: invoiceId });
    expect(from).not.toHaveBeenCalled();
    client.clear();
  });
  it.each([{ data: null, error: { message: "unavailable" } }, { data: { complete: true, quotes: [] }, error: null }])
    ("exposes failed or incomplete reads instead of an empty available set", async (response: { data: unknown; error: unknown }) => {
      rpc.mockResolvedValue(response);
      const { result, client } = setup();
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.data).toBeUndefined();
      client.clear();
    });
});
