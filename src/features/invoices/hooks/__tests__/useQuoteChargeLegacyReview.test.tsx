import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuoteChargeLegacyReview, type LegacyReviewInput } from "../useQuoteChargeLegacyReview";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
const quoteId = "10700000-0000-4000-8000-000000000001";
const invoiceId = "10700000-0000-4000-8000-000000000002";
const requestKey = "10700000-0000-4000-8000-000000000003";
const reviewId = "10700000-0000-4000-8000-000000000004";
const reversalId = "10700000-0000-4000-8000-000000000005";
const clients: QueryClient[] = [];
function mount(enabled = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useQuoteChargeLegacyReview(quoteId, enabled), { wrapper });
}
function input(): LegacyReviewInput {
  return { invoiceId, lineIndex: 0, expectedHash: "a".repeat(64), classification: "rental", quoteLineId: null, quantity: null,
    reason: "Renta verificada", evidence: "Contrato QA", requestKey };
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => { for (const client of clients.splice(0)) client.clear(); });

describe("audited review RPC boundary", () => {
  it("sends only scoped references and evidence, leaving actor and tenant to the server", async () => {
    mocks.rpc.mockResolvedValue({ data: { complete: true, review_id: reviewId, already_existed: false }, error: null });
    const { result } = mount();
    await act(async () => { await result.current.reconcile.mutateAsync(input()); });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("reconcile_quote_charge_history", {
      p_quote_id: quoteId, p_invoice_id: invoiceId, p_line_index: 0, p_expected_hash: "a".repeat(64),
      p_classification: "rental", p_quote_line_id: null, p_quantity: null,
      p_reason: "Renta verificada", p_evidence: "Contrato QA", p_request_key: requestKey,
    });
  });

  it.each([null, { complete: true }, { complete: true, review_id: "bad", already_existed: false }, { complete: true, review_id: reviewId }])("does not treat incomplete write confirmation as success: %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    const { result } = mount();
    await act(async () => { await expect(result.current.reconcile.mutateAsync(input())).rejects.toThrow(/no confirmó/); });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("requires a confirmed reversal identity and preserves the supplied key for a retry", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { complete: true, review_id: reviewId, already_existed: false }, error: null })
      .mockResolvedValueOnce({ data: { complete: true, review_id: reviewId, reversal_id: reversalId, already_existed: true }, error: null });
    const { result } = mount();
    const payload = { reviewId, reason: "Corregir revisión", evidence: "Nueva evidencia QA", requestKey };
    await act(async () => { await expect(result.current.reverse.mutateAsync(payload)).rejects.toThrow(/no confirmó/); });
    await act(async () => { await result.current.reverse.mutateAsync(payload); });
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(mocks.rpc.mock.calls[0][0]).toBe("reverse_quote_charge_history");
  });

  it("fails closed on incomplete reads and exposes the query for explicit retry", async () => {
    mocks.rpc.mockResolvedValue({ data: { complete: false, quote_id: quoteId }, error: null });
    const { result } = mount(true);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith("get_quote_charge_legacy_review", { p_quote_id: quoteId });
  });
});
