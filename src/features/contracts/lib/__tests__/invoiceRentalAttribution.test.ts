import { describe, expect, it } from "vitest";
import { combineInvoiceSummaries } from "../../hooks/contractDetail/useContractFinancialSummary";
import { attributedRentalSubtotal, type InvoiceBookingLink } from "../invoiceRentalAttribution";

const links: InvoiceBookingLink[] = ["a", "b"].map((id) => ({
  invoice_id: "invoice", booking_id: id,
  bookings: { forklifts: { name: `MTY-LG-${id}`, serial_number: `SER-${id}` } },
}));
const lines = [
  { description: "MTY-LG-a — Renta semanal", quantity: 1, unit_price: 4250.25, total: 4250.25, discount: 425.03, discount_type: "$" },
  { description: "MTY-LG-a — Renta diaria", quantity: 1, unit_price: 750.50, total: 750.50, discount: 75.05, discount_type: "$" },
  { description: "MTY-LG-b — Renta mensual", quantity: 1, unit_price: 14500.75, total: 14500.75, discount: 10, discount_type: "%" },
  { description: "Entrega", quantity: 1, unit_price: 500, total: 500, discount: 100, discount_type: "$" },
];
const subtotal = 17951.34; // 4500.67 + 13050.67 + 400 (logística).

describe("ingreso facturado atribuible a una reserva", () => {
  it("suma varias partidas de renta después de descuentos y excluye logística", () => {
    expect(attributedRentalSubtotal(lines, subtotal, "a", links)).toBe(4500.67);
    expect(attributedRentalSubtotal(lines, subtotal, "b", links)).toBe(13050.67);
  });

  it("la serie identifica el equipo aunque su nombre haya cambiado", () => {
    const renamed = lines.map((line) => ({ ...line, description: line.description.startsWith("MTY-LG-a")
      ? line.description.replace("MTY-LG-a", "Nombre anterior") + " (Serie: SER-a)" : line.description }));
    expect(attributedRentalSubtotal(renamed, subtotal, "a", links)).toBe(4500.67);
  });

  it("los índices de selección y el orden de partidas no cambian el reparto", () => {
    const invoice = { id: "invoice", subtotal, status: "sent", line_items: lines };
    const result = combineInvoiceSummaries([invoice], [{ invoice_id: "invoice", line_index: 2, invoices: invoice }],
      { invoice: 2 }, { bookingId: "a", links: [...links].reverse() });
    expect(result).toEqual([{ id: "invoice", subtotal: 4500.67, status: "sent" }]);
    expect(attributedRentalSubtotal([...lines].reverse(), subtotal, "a", links)).toBe(4500.67);
  });

  it("una factura ligada sólo por booking_id se revisa si también cubre otras reservas", () => {
    const invoice = { id: "invoice", subtotal, status: "sent", line_items: [{ ...lines[0], description: "Toyota (x2) — Renta semanal" }] };
    expect(combineInvoiceSummaries([invoice], [], { invoice: 2 }, { bookingId: "a", links })[0].subtotal).toBeNull();
  });

  it("una sola reserva permite identificar toda su renta, sin atribuir sus extras", () => {
    expect(attributedRentalSubtotal([lines[0], lines[1], lines[3]], 4900.67, "a", [links[0]])).toBe(4500.67);
  });

  it.each([
    { name: "mismo nombre de equipos", data: links.map((link) => ({ ...link, bookings: links[0].bookings })) },
    { name: "reserva ausente", data: [links[1]] },
    { name: "vínculos ausentes", data: [] },
    { name: "equipo sin renta identificada", data: [...links, { invoice_id: "invoice", booking_id: "c" }] },
  ])("pide revisión con $name", ({ data }) => {
    expect(attributedRentalSubtotal(lines, subtotal, "a", data)).toBeNull();
  });

  it.each([
    { name: "subtotal incoherente", items: lines, declared: subtotal + 0.01 },
    { name: "partidas ausentes", items: null, declared: subtotal },
    { name: "descuento no finito", items: [{ ...lines[0], discount: Number.NaN }, ...lines.slice(1)], declared: subtotal },
    { name: "importe bruto alterado", items: [{ ...lines[0], total: 9999 }, ...lines.slice(1)], declared: subtotal },
    { name: "partida agrupada", items: [{ ...lines[0], description: "Toyota (x2) — Renta semanal" }, ...lines.slice(1)], declared: subtotal },
  ])("no publica un importe verificable con $name", ({ items, declared }) => {
    expect(attributedRentalSubtotal(items, declared, "a", links)).toBeNull();
  });

  it("una factura USD sin tipo de cambio no se suma como si fueran pesos", () => {
    const invoice = { id: "invoice", subtotal, status: "sent", line_items: lines, moneda: "USD", tipo_cambio: null };
    expect(combineInvoiceSummaries([], [{ invoice_id: "invoice", invoices: invoice }],
      { invoice: 2 }, { bookingId: "a", links })[0].subtotal).toBeNull();
    const valid = { ...invoice, tipo_cambio: 18.25 };
    expect(combineInvoiceSummaries([], [{ invoice_id: "invoice", invoices: valid }],
      { invoice: 2 }, { bookingId: "a", links })[0].subtotal).toBeCloseTo(82137.2275);
  });
});
