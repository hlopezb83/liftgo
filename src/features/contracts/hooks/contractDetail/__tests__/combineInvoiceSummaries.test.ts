import { describe, it, expect } from "vitest";
import { combineInvoiceSummaries } from "../useContractFinancialSummary";

/**
 * M3-03: el resumen financiero del contrato combina la ruta directa
 * (invoices.booking_id) con la pivote (invoice_bookings) deduplicando por
 * invoice.id y descartando `cancelled` en ambas fuentes.
 */
describe("combineInvoiceSummaries", () => {
  it("solo ruta directa → se conserva tal cual", () => {
    const direct = [{ id: "inv-1", subtotal: 100, status: "sent" }];
    expect(combineInvoiceSummaries(direct, [])).toEqual(direct);
  });

  it("factura solo en la pivote (multi-reserva) se incluye", () => {
    const direct = [{ id: "inv-1", subtotal: 100, status: "sent" }];
    const pivot = [
      { invoice_id: "inv-2", invoices: { id: "inv-2", subtotal: 200, status: "sent" } },
    ];
    const result = combineInvoiceSummaries(direct, pivot);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(["inv-1", "inv-2"]);
  });

  it("factura ligada por ambas rutas cuenta una sola vez", () => {
    const direct = [{ id: "inv-1", subtotal: 100, status: "sent" }];
    const pivot = [
      { invoice_id: "inv-1", invoices: { id: "inv-1", subtotal: 100, status: "sent" } },
    ];
    const result = combineInvoiceSummaries(direct, pivot);
    expect(result).toHaveLength(1);
  });

  it("factura cancelada ligada por pivote no se cuenta", () => {
    const direct: { id: string; subtotal: number; status: string }[] = [];
    const pivot = [
      { invoice_id: "inv-3", invoices: { id: "inv-3", subtotal: 300, status: "cancelled" } },
    ];
    expect(combineInvoiceSummaries(direct, pivot)).toEqual([]);
  });

  it("fila de pivote sin invoice embebida (null) se ignora", () => {
    const pivot = [{ invoice_id: "inv-4", invoices: null }];
    expect(combineInvoiceSummaries([], pivot)).toEqual([]);
  });

  it("direct/pivot null (defensivo) → arreglo vacío", () => {
    expect(combineInvoiceSummaries(null, null)).toEqual([]);
  });
});

/**
 * Auditoría v2 §3.2: una factura que cubre varias reservas ya no se suma
 * completa en el resumen de cada contrato.
 */
describe("atribución de facturas multi-reserva", () => {
  const invoice = {
    id: "inv-9",
    subtotal: 30000,
    status: "sent",
    line_items: [
      { description: "Reserva A", total: 18000 },
      { description: "Reserva B", quantity: 2, unit_price: 6000 },
    ],
  };

  it("usa la partida indicada por line_index", () => {
    const result = combineInvoiceSummaries(
      [],
      [{ invoice_id: "inv-9", line_index: 0, invoices: invoice }],
      { "inv-9": 2 },
    );
    expect(result).toEqual([{ id: "inv-9", subtotal: 18000, status: "sent" }]);
  });

  it("calcula la partida por cantidad × precio unitario", () => {
    const result = combineInvoiceSummaries(
      [],
      [{ invoice_id: "inv-9", line_index: 1, invoices: invoice }],
      { "inv-9": 2 },
    );
    expect(result[0].subtotal).toBe(12000);
  });

  it("sin line_index prorratea entre las reservas de la factura", () => {
    const result = combineInvoiceSummaries(
      [],
      [{ invoice_id: "inv-9", line_index: null, invoices: { ...invoice, line_items: null } }],
      { "inv-9": 3 },
    );
    expect(result[0].subtotal).toBe(10000);
  });

  it("factura de una sola reserva conserva su subtotal completo", () => {
    const result = combineInvoiceSummaries(
      [],
      [{ invoice_id: "inv-9", line_index: 0, invoices: invoice }],
      { "inv-9": 1 },
    );
    expect(result[0].subtotal).toBe(30000);
  });
});
