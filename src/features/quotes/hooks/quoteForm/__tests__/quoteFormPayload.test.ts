import { describe, it, expect } from "vitest";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { buildQuotePayload, type BuildQuotePayloadArgs } from "../quoteFormPayload";

const baseLine: LineItem = { description: "x", quantity: 1, unit_price: 100, total: 100 };

function args(overrides: Partial<BuildQuotePayloadArgs> = {}): BuildQuotePayloadArgs {
  return {
    existingQuote: null,
    nextNumber: "COT-1234",
    customerId: "c1",
    customerName: "Cliente SA",
    quoteType: "rental",
    rentalLines: [{ modelId: "m1", quantity: 1, dailyRate: 100, weeklyRate: 500, monthlyRate: 1800, discount: 0, discountType: "%" }],
    saleLines: [],
    startDate: new Date("2026-03-01T12:00:00"),
    endDate: new Date("2026-03-31T12:00:00"),
    lineItems: [baseLine],
    subtotal: 100,
    taxRate: 16,
    taxAmount: 16,
    total: 116,
    validUntil: new Date("2026-04-15T12:00:00"),
    notes: "x",
    currency: "MXN",
    ...overrides,
  };
}

describe("buildQuotePayload", () => {
  it("usa quote_number existente cuando hay edición", () => {
    const p = buildQuotePayload(args({ existingQuote: { quote_number: "COT-0007", status: "sent" } }));
    expect(p.quote_number).toBe("COT-0007");
    expect(p.status).toBe("sent");
  });

  it("usa nextNumber para cotizaciones nuevas, status 'draft'", () => {
    const p = buildQuotePayload(args());
    expect(p.quote_number).toBe("COT-1234");
    expect(p.status).toBe("draft");
  });

  it("fallback final 'COT-0001' cuando no hay número previo", () => {
    const p = buildQuotePayload(args({ existingQuote: null, nextNumber: null }));
    expect(p.quote_number).toBe("COT-0001");
  });

  it("rental: usa fechas explícitas y serializa rental_meta", () => {
    const p = buildQuotePayload(args());
    expect(p.start_date).toBe("2026-03-01");
    expect(p.end_date).toBe("2026-03-31");
    expect(p.quote_type).toBe("rental");
    expect(Array.isArray(p.rental_meta)).toBe(true);
    expect((p.rental_meta as unknown[]).length).toBe(1);
  });

  it("sale: rental_meta es null y equipment_model_id viene de saleLines", () => {
    const p = buildQuotePayload(args({
      quoteType: "sale",
      rentalLines: [],
      saleLines: [{ modelId: "mSale", quantity: 1, unitPrice: 100, discount: 0, discountType: "%" }],
      startDate: undefined, endDate: undefined,
    }));
    expect(p.rental_meta).toBeNull();
    expect(p.equipment_model_id).toBe("mSale");
    // sale sin fechas → fallback al "hoy" en zona Monterrey (formato yyyy-MM-dd válido)
    expect(p.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("redondea subtotal/tax/total a 2 decimales", () => {
    const p = buildQuotePayload(args({ subtotal: 100.005, taxAmount: 16.0049, total: 116.0099 }));
    expect(p.subtotal).toBe(100.01);
    expect(p.tax_amount).toBe(16);
    expect(p.total).toBe(116.01);
  });

  it("normaliza vacíos a null y respeta currency", () => {
    const p = buildQuotePayload(args({
      customerName: "", notes: "", validUntil: null, currency: "USD",
    }));
    expect(p.customer_name).toBeNull();
    expect(p.notes).toBeNull();
    expect(p.valid_until).toBeNull();
    expect(p.currency).toBe("USD");
  });

  it("equipment_model_id null cuando no hay líneas con modelId", () => {
    const p = buildQuotePayload(args({
      quoteType: "rental",
      rentalLines: [{ modelId: "", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 0, discount: 0, discountType: "%" }],
    }));
    expect(p.equipment_model_id).toBeNull();
  });
});
