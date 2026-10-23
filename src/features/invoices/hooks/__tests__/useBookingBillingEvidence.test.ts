import { beforeEach, describe, expect, it, vi } from "vitest";
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
import { fetchBookingInvoiceClaims, readAllBillingPages } from "../invoices/useBookingBillingEvidence";
import { bookingPeriodConflict } from "../../lib/originalBookingPeriod";

beforeEach(() => vi.clearAllMocks());
describe("complete billing evidence", () => {
  it("reads beyond one page and rejects errors or truncation instead of reopening periods", async () => {
    const read = vi.fn().mockResolvedValueOnce({ data: Array(1000).fill("row"), error: null }).mockResolvedValueOnce({ data: ["last"], error: null });
    expect(await readAllBillingPages(read)).toHaveLength(1001);
    expect(read).toHaveBeenNthCalledWith(2, 1000, 1999);
    await expect(readAllBillingPages(async () => ({ data: null, error: new Error("failed") }))).rejects.toThrow("failed");
    await expect(readAllBillingPages(async () => ({ data: Array(1000).fill("row"), error: null }))).rejects.toThrow(/historial completo/);
  });
  it.each(["direct", "pivot", "both"])("preserves %s links and includes their actual periods", async (link) => {
    const invoice = { id: "i1", booking_id: "b1", status: "draft", line_items: [{ line_kind: "rental" }], billing_period_start: "2026-10-25", billing_period_end: "2026-10-26" };
    from.mockImplementation((table: string) => {
      const chain = { select: vi.fn(), not: vi.fn(), neq: vi.fn(), order: vi.fn(), range: vi.fn() };
      for (const name of ["select", "not", "neq", "order"] as const) chain[name].mockReturnValue(chain);
      chain.range.mockResolvedValue({ error: null, data: table === "invoices"
        ? (link === "pivot" ? [] : [invoice])
        : (link === "direct" ? [] : [{ invoice_id: "i1", booking_id: "b1", invoices: invoice }]) });
      return chain;
    });
    const claims = await fetchBookingInvoiceClaims();
    expect(claims.every((claim) => JSON.stringify(claim.line_items) === JSON.stringify(invoice.line_items))).toBe(true);
    expect(claims.length).toBe(link === "both" ? 2 : 1);
    expect(bookingPeriodConflict("b1", "2026-10-23", "2026-10-24", claims)).toBe(false);
    expect(bookingPeriodConflict("b1", "2026-10-24", "2026-10-25", claims)).toBe(true);
    expect(bookingPeriodConflict("b1", "2026-10-25", "2026-10-26", claims, "i1")).toBe(false);
  });
});

describe("billing page cancellation", () => {
  it("does not start a read when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const read = vi.fn();
    await expect(readAllBillingPages(read, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(read).not.toHaveBeenCalled();
  });

  it.each([1, 1000])("rejects %i late rows after cancellation instead of returning partial evidence", async (count) => {
    const controller = new AbortController();
    let finish!: (value: { data: string[]; error: null }) => void;
    const read = vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const result = readAllBillingPages(read, controller.signal);
    controller.abort();
    finish({ data: Array(count).fill("row"), error: null });
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(read).toHaveBeenCalledOnce();
  });

  it("stops during the second page without returning the first successful page", async () => {
    const controller = new AbortController();
    const read = vi.fn().mockResolvedValueOnce({ data: Array(1000).fill("row"), error: null })
      .mockImplementationOnce(async () => {
        controller.abort();
        return { data: Array(1000).fill("late row"), error: null };
      });
    await expect(readAllBillingPages(read, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("rejects a partial page failure, never representing it as absence of claims", async () => {
    const failure = new Error("page two unavailable");
    const read = vi.fn().mockResolvedValueOnce({ data: Array(1000).fill("row"), error: null })
      .mockResolvedValueOnce({ data: null, error: failure });
    await expect(readAllBillingPages(read, new AbortController().signal)).rejects.toBe(failure);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
