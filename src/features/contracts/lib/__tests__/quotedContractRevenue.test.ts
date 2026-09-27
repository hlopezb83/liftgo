import { describe, expect, it } from "vitest";
import { generateLineItemsFromModel } from "@/lib/domain/invoiceHelpers";
import { verifyContractRevenue, type ContractQuoteTerms, type ContractPriceTerms } from "../contractRevenueVerification";

const terms: ContractPriceTerms = {
  start_date: "2026-09-26", end_date: "2026-10-03", daily_rate: 750.50, weekly_rate: 4250.25, monthly_rate: 14500.75,
};
const meta = { modelId: "fd50", quantity: 2, dailyRate: 750.50, weeklyRate: 4250.25, monthlyRate: 14500.75 };
const bookings = ["a", "b"].map((id) => ({
  ...terms, id, forklift_id: id, quote_id: "quote", organization_id: "org", status: "confirmed", currency: "MXN",
}));
const quote: ContractQuoteTerms = {
  id: "quote", organization_id: "org", currency: "MXN", start_date: terms.start_date, end_date: terms.end_date,
  rental_meta: [meta], units: bookings.map((row) => ({ id: row.forklift_id, equipment_model_id: "fd50" })), bookings,
  line_items: generateLineItemsFromModel("LiftGo FD50", 750.50, 4250.25, 14500.75, terms.start_date, terms.end_date, 2)
    .map((line) => ({ ...line, discount: 10, discount_type: "%" })),
};
const verify = (source = quote, contractTerms = terms, booking = bookings[0]) => verifyContractRevenue({
  booking, quote: source, terms: contractTerms, isLoading: false, isError: false,
});

describe("neto contractual desde la cotización completa", () => {
  it("cada equipo conserva su asignación de centavos: 4,500.67 y 4,500.68 netos", () => {
    expect(verify()).toEqual({ status: "verified", reason: null, expectedRevenue: 4500.67 });
    expect(verify(quote, terms, bookings[1]).expectedRevenue).toBe(4500.68);
  });

  it("la recurrencia no altera el acuerdo completo esperado en el contrato", () => {
    expect(verify({ ...quote, bookings: bookings.map((row) => ({ ...row, recurring_billing: true })) }).expectedRevenue).toBe(4500.67);
  });

  it("conserva el descuento fijo original sin duplicarlo por unidad ni añadir logística", () => {
    const source = { ...quote, line_items: [
      ...(quote.line_items as Array<Record<string, unknown>>).map((line, i) => ({ ...line, discount_type: "$", discount: i === 0 ? 8500.50 : 499.50 })),
      { description: "Entrega", quantity: 1, unit_price: 500, total: 500, discount: 100, discount_type: "$" },
    ] };
    expect(verify(source).expectedRevenue).toBe(500.75);
    expect(verify(source, terms, bookings[1]).expectedRevenue).toBe(500.75);
  });

  it.each([
    { name: "periodo contractual parcial", patch: { end_date: "2026-10-01" } },
    { name: "periodo extendido", patch: { end_date: "2026-10-05" } },
    { name: "tarifa contractual distinta", patch: { weekly_rate: 4300 } },
  ])("mantiene revisión con $name", ({ patch }) => {
    expect(verify(quote, { ...terms, ...patch }).status).toBe("review");
  });

  it.each([
    { name: "lote incompleto", patch: { bookings: [bookings[0]] } },
    { name: "organización distinta", patch: { organization_id: "other-org" } },
    { name: "datos de otra organización en el lote", patch: { bookings: [bookings[0], { ...bookings[1], organization_id: "other-org" }] } },
    { name: "moneda distinta", patch: { currency: "USD" } },
    { name: "unidad cancelada", patch: { bookings: [bookings[0], { ...bookings[1], status: "cancelled" }] } },
    { name: "modelos ambiguos", patch: { rental_meta: [meta, meta] } },
  ])("no deduce un neto con $name", ({ patch }) => {
    expect(verify({ ...quote, ...patch }).status).toBe("review");
  });
});
