import { describe, expect, it } from "vitest";
import { buildFromInvoice, buildFromQuote } from "../../hooks/invoiceForm/invoiceFormBuilders";
import { toLineItems } from "../invoiceLineSerialization";
import { lineItemSchema } from "../invoiceFormSchema";
import {
  applyQuoteChargeAvailability, buildAvailableQuoteChargeLines, collectInvoiceChargeQuoteIds,
  parseQuoteChargeAvailability, quoteChargeSelectionError, preserveEnteredQuoteChargeLines,
  CHARGE_AVAILABILITY_UNAVAILABLE, CHARGE_FIXED_DISCOUNT_REVIEW, CHARGE_LEGACY_REVIEW,
  type QuoteChargeAvailability,
} from "../quoteChargeAvailability";

const quoteId = "11111111-1111-4111-8111-111111111111";
const lineId = "22222222-2222-4222-8222-222222222222";
const otherQuoteId = "33333333-3333-4333-8333-333333333333";
function availability(consumed = 0): QuoteChargeAvailability {
  return { complete: true, quotes: [{ quote_id: quoteId, legacy_review_required: false, lines: [{
    quote_line_id: lineId, quoted_quantity: 4, consumed_quantity: consumed, remaining_quantity: 4 - consumed,
    line: { quote_line_id: lineId, line_kind: "charge", charge_kind: "logistics", description: "Entrega", quantity: 4, unit_price: 100, total: 400,
      clave_prod_serv: "78101800", clave_unidad: "E48", objeto_imp: "02", tax_rate: 8, discount: 10, discount_type: "%" },
  }] }] };
}

describe("authoritative quote-charge availability", () => {
  it("reselection preserves own partial rows, then restores a deleted origin from the refreshed balance", () => {
    const available = buildAvailableQuoteChargeLines([quoteId], availability(1));
    const current = [{ ...available[0], quantity: 0.5, total: 50 }];
    expect(preserveEnteredQuoteChargeLines(available, current)).toEqual(current);
    expect(preserveEnteredQuoteChargeLines(available, [])).toEqual(available);
  });

  it("includes a quote-level charge once for any number of sibling bookings", () => {
    const lines = buildAvailableQuoteChargeLines([quoteId, quoteId], parseQuoteChargeAvailability(availability(), [quoteId]));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ source_quote_id: quoteId, source_quote_line_id: lineId, quantity: 4 });
  });

  it("uses the exact remaining quantity, including fractional draft reservations", () => {
    const lines = buildAvailableQuoteChargeLines([quoteId], availability(2.5));
    expect(lines[0]).toMatchObject({ quantity: 1.5, total: 150, discount: 10, discount_type: "%", tax_rate: 8 });
    expect(lineItemSchema.safeParse({ ...lines[0], quantity: 0.5 }).success).toBe(true);
    expect(buildAvailableQuoteChargeLines([quoteId], availability(4))).toEqual([]);
  });

  it("responds to released cancellation claims without any historical-description heuristic", () => {
    expect(buildAvailableQuoteChargeLines([quoteId], availability(4))).toEqual([]);
    expect(buildAvailableQuoteChargeLines([quoteId], availability(0))[0].quantity).toBe(4);
  });

  it("does not apply an invoice-history limit of 501", () => {
    const data = availability();
    Object.assign(data.quotes[0].lines[0], { quoted_quantity: 1000, consumed_quantity: 750, remaining_quantity: 250 });
    data.quotes[0].lines[0].line.quantity = 1000;
    expect(buildAvailableQuoteChargeLines([quoteId], parseQuoteChargeAvailability(data, [quoteId]))[0].quantity).toBe(250);
  });

  it.each([undefined, null, {}, { complete: false, quotes: [] }, { complete: true, quotes: [] },
    { complete: true, quotes: [{ quote_id: quoteId }] }])("fails closed for incomplete response %j", (response: unknown) => {
    expect(() => parseQuoteChargeAvailability(response, [quoteId])).toThrow(CHARGE_AVAILABILITY_UNAVAILABLE);
  });

  it("rejects duplicates, missing quotes and inconsistent balances", () => {
    const data = availability();
    expect(() => parseQuoteChargeAvailability(data, [quoteId, otherQuoteId])).toThrow(CHARGE_AVAILABILITY_UNAVAILABLE);
    expect(() => parseQuoteChargeAvailability({ ...data, quotes: [...data.quotes, ...data.quotes] }, [quoteId])).toThrow(CHARGE_AVAILABILITY_UNAVAILABLE);
    data.quotes[0].lines[0].remaining_quantity = 2;
    expect(() => parseQuoteChargeAvailability(data, [quoteId])).toThrow(CHARGE_AVAILABILITY_UNAVAILABLE);
  });

  it("reports unavailable data as a recoverable validation message rather than crashing a render", () => {
    expect(quoteChargeSelectionError([quoteId], [], undefined)).toBe(CHARGE_AVAILABILITY_UNAVAILABLE);
    expect(quoteChargeSelectionError([quoteId], [], { complete: true, quotes: [] })).toBe(CHARGE_AVAILABILITY_UNAVAILABLE);
  });

  it("blocks ambiguous historical invoices instead of assigning identities by descriptions", () => {
    const data = availability();
    data.quotes[0].legacy_review_required = true;
    expect(() => buildAvailableQuoteChargeLines([quoteId], data)).toThrow(CHARGE_LEGACY_REVIEW);
    expect(quoteChargeSelectionError([quoteId], [], data)).toBe(CHARGE_LEGACY_REVIEW);
  });

  it("requires explicit review of partial fixed discounts in prefill and in the edited quantities", () => {
    const data = availability(1);
    data.quotes[0].lines[0].line.discount_type = "$";
    expect(() => buildAvailableQuoteChargeLines([quoteId], data)).toThrow(CHARGE_FIXED_DISCOUNT_REVIEW);
    const full = availability();
    full.quotes[0].lines[0].line.discount_type = "$";
    const lines = buildAvailableQuoteChargeLines([quoteId], full);
    expect(quoteChargeSelectionError([quoteId], lines, full)).toBeNull();
    lines[0].quantity = 2;
    expect(quoteChargeSelectionError([quoteId], lines, full)).toBe(CHARGE_FIXED_DISCOUNT_REVIEW);
  });

  it("rejects a duplicate source pair even when its summed quantity fits the available balance", () => {
    const data = availability(1);
    const [line] = buildAvailableQuoteChargeLines([quoteId], data);
    expect(quoteChargeSelectionError([quoteId], [{ ...line, quantity: 2 }, { ...line, quantity: 2 }], data)).toMatch(/más de una partida/);
    expect(quoteChargeSelectionError([quoteId], [{ ...line, quantity: 1 }, { ...line, quantity: 2 }], data)).toMatch(/más de una partida/);
    expect(quoteChargeSelectionError([quoteId], [{ ...line, quantity: 3 }], data)).toBeNull();
    expect(quoteChargeSelectionError([quoteId], [{ ...line, quantity: 4 }], data)).toMatch(/supera lo disponible/);
  });

  it("preserves origins and own partial quantity through edit, Zod and submit serialization", () => {
    const [line] = buildAvailableQuoteChargeLines([quoteId], availability());
    const own = { ...line, quantity: 1.5, total: 150 };
    const values = buildFromInvoice({ customer_id: "customer", line_items: [own] }, []);
    const parsed = values.lineItems.map((item) => lineItemSchema.parse(item));
    expect(toLineItems(parsed)[0]).toMatchObject({ source_quote_id: quoteId, source_quote_line_id: lineId, quantity: 1.5, tax_rate: 8, discount: 10 });
    // Backend excludes this invoice before producing this balance.
    expect(quoteChargeSelectionError([quoteId], parsed, availability(2))).toBeNull();
  });

  it("keeps source scope after the last traced row is removed and an unrelated manual row is added", () => {
    const originalLines = [{ source_quote_id: quoteId }];
    const ids = collectInvoiceChargeQuoteIds({ originalLines, currentLines: [{}], bookingQuoteIds: [] });
    expect(ids).toEqual([quoteId]);
    expect(quoteChargeSelectionError(ids, [], undefined)).toBe(CHARGE_AVAILABILITY_UNAVAILABLE);
  });

  it("quote conversion includes only remaining charges without losing rental/extension/prorated lines", () => {
    const data = availability(2);
    const rental = { line_kind: "rental" as const, description: "MC — Renta septiembre 2026 (19 días al precio diario)", quantity: 19, unit_price: 100, total: 1900 };
    const extension = { ...rental, description: "MC — Extensión: Renta diaria (2026-10-01 al 2026-10-02)" };
    const q = { id: quoteId, customer_id: "c", line_items: [rental, extension, data.quotes[0].lines[0].line] };
    const result = buildFromQuote({ q, assignments: [], forklifts: [], customers: [], chargeAvailability: data });
    expect(result.lineItems).toHaveLength(3);
    expect(result.lineItems[2]).toMatchObject({ quantity: 2, source_quote_line_id: lineId });
    expect(result.lineItems.slice(0, 2).every((line) => !line.source_quote_line_id)).toBe(true);
  });

  it("quote conversion cannot silently ignore a charge missing from its response", () => {
    const source = availability().quotes[0].lines[0].line;
    expect(() => applyQuoteChargeAvailability(quoteId, [source], { complete: true, quotes: [{ quote_id: quoteId, legacy_review_required: false, lines: [] }] }))
      .toThrow(CHARGE_AVAILABILITY_UNAVAILABLE);
  });
});
