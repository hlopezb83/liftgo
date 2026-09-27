import { describe, expect, it, vi } from "vitest";
import { generateLineItemsFromModel, computeTotals } from "@/lib/domain/invoiceHelpers";
import { applyDiscount, money } from "@/lib/domain/invoiceTotals";
import { recurringQuoteIssue } from "../../../../../supabase/functions/generate-recurring-invoices/quoteDiscountGuard";
import { buildQuotedBookingLines, quotedBillingPeriodError, type BookingQuoteSource, type QuotedBooking } from "../quotedBookingLines";

const meta = { modelId: "model", quantity: 2, dailyRate: 750.50, weeklyRate: 4250.25, monthlyRate: 14500.75 };
const quote: BookingQuoteSource = {
  id: "quote", start_date: "2026-09-26", end_date: "2026-10-03", rental_meta: [meta],
  line_items: generateLineItemsFromModel("Toyota", 750.50, 4250.25, 14500.75, "2026-09-26", "2026-10-03", 2)
    .map((line) => ({ ...line, discount: 10, discount_type: "%" })),
};
const bookings: QuotedBooking[] = ["a", "b"].map((id) => ({
  id, forklift_id: id, quote_id: quote.id, status: "confirmed",
  start_date: "2026-09-26", end_date: "2026-10-03", recurring_billing: false,
  daily_rate: meta.dailyRate, weekly_rate: meta.weeklyRate, monthly_rate: meta.monthlyRate,
}));
const units = ["a", "b"].map((id) => ({ id, equipment_model_id: "model" }));
const fallback = vi.fn(() => [{ description: "Sin cotización", quantity: 1, unit_price: 100, total: 100 }]);
const build = (selected = bookings, source = quote, all = bookings) =>
  buildQuotedBookingLines(selected, all, units, [source], fallback);

describe("descuentos de cotización al facturar reservas", () => {
  it("al guardar rechaza un periodo parcial introducido después de precargar partidas", () => {
    expect(quotedBillingPeriodError(bookings, [quote], "2026-09-26", "2026-09-27")).toMatch(/periodo completo/);
    expect(quotedBillingPeriodError(bookings, [quote], "2026-09-26", "2026-10-03")).toBeNull();
    expect(quotedBillingPeriodError(bookings, [], "2026-09-26", "2026-10-03")).toMatch(/cargue/);
  });
  it("permite facturar sólo el tramo exacto de una extensión cargada y de la reserva seleccionada", () => {
    const extension = {
      id: "extension", booking_id: "a", original_end_date: "2026-10-03", new_end_date: "2026-10-06",
      invoice_id: null, bookings: { id: "a" },
    };
    const context = { requestedId: "extension", loaded: extension };
    expect(quotedBillingPeriodError([bookings[0]], [quote], "2026-10-04", "2026-10-06", context)).toBeNull();
    expect(quotedBillingPeriodError([bookings[0]], [], "2026-10-04", "2026-10-06", context)).toBeNull();
    expect(quotedBillingPeriodError([bookings[1]], [quote], "2026-10-04", "2026-10-06", context)).toMatch(/periodo completo/);
    expect(quotedBillingPeriodError(bookings, [quote], "2026-10-04", "2026-10-06", context)).toMatch(/periodo completo/);
    expect(quotedBillingPeriodError([bookings[0]], [quote], "2026-10-03", "2026-10-06", context)).toMatch(/periodo completo/);
    expect(quotedBillingPeriodError([bookings[0]], [quote], "2026-10-04", "2026-10-05", context)).toMatch(/periodo completo/);
  });
  it("una query string o una extensión incoherente o ya facturada no exime el pacto original", () => {
    const extension = {
      id: "extension", booking_id: "a", original_end_date: "2026-10-03", new_end_date: "2026-10-06",
      invoice_id: null, bookings: { id: "a" },
    };
    const contexts = [
      { requestedId: "extension", loaded: null },
      { requestedId: "other", loaded: extension },
      { requestedId: null, loaded: extension },
      { requestedId: "extension", loaded: { ...extension, bookings: { id: "b" } } },
      { requestedId: "extension", loaded: { ...extension, invoice_id: "invoice" } },
      { requestedId: "extension", loaded: { ...extension, new_end_date: "2026-10-03" } },
    ];
    for (const context of contexts) {
      expect(quotedBillingPeriodError([bookings[0]], [quote], "2026-10-04", "2026-10-06", context)).toMatch(/periodo completo/);
    }
  });
  it("COT-0005 conserva $10,441.56 y no $11,601.74 al elegir los dos equipos", () => {
    const lines = build();
    expect(lines).toHaveLength(2);
    expect(computeTotals(lines, 16)).toEqual({ subtotal: 9001.35, taxAmount: 1440.21, total: 10441.56 });
    expect(lines.map((line) => line.discount)).toEqual([850.05, 150.10]);
  });

  it("divide centavos de descuento de forma estable entre reservas, sin repetirlo", () => {
    const one = build([bookings[0]]);
    const two = build([bookings[1]]);
    expect(one.map((line) => line.discount)).toEqual([425.03, 75.05]);
    expect(two.map((line) => line.discount)).toEqual([425.02, 75.05]);
    expect(money(computeTotals(one, 0).subtotal).add(computeTotals(two, 0).subtotal).value).toBe(9001.35);
    expect(build([bookings[1], bookings[0]], quote, [...bookings].reverse())).toEqual(build());
  });

  it("preserva un descuento fijo distribuido entre partidas, nunca por cada equipo", () => {
    const source = { ...quote, line_items: (quote.line_items as Array<Record<string, unknown>>).map((line, i) =>
      ({ ...line, discount: i === 0 ? 8500.50 : 499.50, discount_type: "$" })) };
    expect(computeTotals(build(bookings, source), 16)).toEqual({ subtotal: 1001.50, taxAmount: 160.24, total: 1161.74 });
    expect(build(bookings, source).map(applyDiscount)).toEqual([0, 1001.50]);
  });

  it("no incorpora logística ni vuelve a aplicar descuentos a los importes netos", () => {
    const source = { ...quote, line_items: [...quote.line_items as object[], { description: "Entrega", total: 500 }] };
    expect(build(bookings, source)).toEqual(build());
  });

  it.each([
    { name: "periodo modificado", patch: { end_date: "2026-10-04" } },
    { name: "periodo recurrente", patch: { recurring_billing: true } },
    { name: "tarifa modificada", patch: { daily_rate: 999 } },
  ])("no pierde el descuento silenciosamente con $name", ({ patch }) => {
    const changed = bookings.map((booking) => ({ ...booking, ...patch }));
    expect(() => build(changed, quote, changed)).toThrow();
  });

  it("bloquea la precarga si falta la cotización, el mapeo es ambiguo o el lote está incompleto", () => {
    expect(() => buildQuotedBookingLines(bookings, bookings, units, [], fallback)).toThrow(/cargue/);
    expect(() => build(bookings, { ...quote, rental_meta: [meta, meta] })).toThrow(/certeza/);
    expect(() => build([bookings[0]], quote, [bookings[0]])).toThrow(/certeza/);
  });

  it("no confunde renta legacy o descuentos sólo en metadatos con tarifas sin descuento", () => {
    expect(() => build(bookings, { ...quote, rental_meta: [], line_items: [
      { description: "Renta montacargas", quantity: 1, unit_price: 1000, total: 1000, discount: 10, discount_type: "%" },
    ] })).toThrow(/certeza/);
    const noDiscount = (quote.line_items as Array<Record<string, unknown>>).map((line) => ({ ...line, discount: 0 }));
    expect(() => build(bookings, { ...quote, rental_meta: [{ ...meta, discount: 10 }], line_items: noDiscount })).toThrow(/certeza/);
  });

  it("mantiene las reservas sin cotización o sin descuento", () => {
    expect(buildQuotedBookingLines([{ ...bookings[0], quote_id: null }], [], [], [], fallback)).toEqual(fallback());
    expect(build(bookings, { ...quote, line_items: [] })).toEqual([...fallback(), ...fallback()]);
  });
});

describe("facturación automática: protección del pacto comercial", () => {
  const source = { organization_id: "org", line_items: quote.line_items, rental_meta: quote.rental_meta };
  it("excluye descuentos tanto de renta como de extras antes de generar", () => {
    expect(recurringQuoteIssue("quote", "org", source)).toBe("quote_discount_review");
    expect(recurringQuoteIssue("quote", "org", [source])).toBe("quote_discount_review");
    expect(recurringQuoteIssue("quote", "org", { ...source, line_items: [{ description: "Logística", discount: 200 }] })).toBe("quote_discount_review");
  });
  it("no trata una cotización inaccesible/de otra organización como precio sin descuento", () => {
    expect(recurringQuoteIssue("quote", "other-org", source)).toBe("quote_source_missing");
    expect(recurringQuoteIssue("quote", "org", null)).toBe("quote_source_missing");
    expect(recurringQuoteIssue("quote", "org", [])).toBe("quote_source_missing");
    expect(recurringQuoteIssue("quote", "org", { ...source, line_items: null })).toBe("quote_source_missing");
  });
  it("deja elegibles los pactos sin descuento y las reservas independientes", () => {
    expect(recurringQuoteIssue(null, "org", null)).toBeNull();
    expect(recurringQuoteIssue("quote", "org", { ...source, line_items: [], rental_meta: [] })).toBeNull();
  });
});
