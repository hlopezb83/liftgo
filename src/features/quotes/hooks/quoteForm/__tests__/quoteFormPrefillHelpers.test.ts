import { describe, it, expect, vi } from "vitest";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import {
  applyBaseFields, applyLogistics, applySaleLines, applyRentalLines, defaultValidUntil,
  type ExistingQuote, type EquipmentModel, type QuoteFormState,
} from "../quoteFormPrefillHelpers";
import type { RentalLine } from "../../../components/quotes/RentalLineItems";

function makeState(): QuoteFormState {
  return {
    setQuoteType: vi.fn(), setCustomerId: vi.fn(), setCustomerName: vi.fn(),
    setDateRange: vi.fn(), setTaxRate: vi.fn(), setCurrency: vi.fn(),
    setNotes: vi.fn(), setValidUntil: vi.fn(),
    setIncludeLogistics: vi.fn(), setLogisticsCost: vi.fn(),
    setSaleLines: vi.fn(), setRentalLines: vi.fn(),
  } as unknown as QuoteFormState;
}

const models: EquipmentModel[] = [
  { id: "m1", manufacturer: "Toyota", model: "8FBE20", default_daily_rate: 500, default_weekly_rate: 2500, default_monthly_rate: 8000 },
  { id: "m2", manufacturer: "Hyster", model: "H50", default_daily_rate: 600, default_weekly_rate: null, default_monthly_rate: 9000 },
];

describe("applyBaseFields", () => {
  it("aplica modo sale y los campos básicos", () => {
    const s = makeState();
    const q: ExistingQuote = {
      customer_id: "c1", customer_name: "Cliente", tax_rate: "16",
      currency: "USD", notes: "demo", valid_until: "2026-04-30", start_date: "2026-03-01", end_date: "2026-03-31",
    };
    applyBaseFields(q, s, true);
    expect(s.setQuoteType).toHaveBeenCalledWith("sale");
    expect(s.setCustomerId).toHaveBeenCalledWith("c1");
    expect(s.setTaxRate).toHaveBeenCalledWith("16");
    expect(s.setCurrency).toHaveBeenCalledWith("USD");
    expect(s.setDateRange).toHaveBeenCalled();
    expect(s.setValidUntil).toHaveBeenCalled();
  });

  it("usa MXN por defecto y aplica modo rental", () => {
    const s = makeState();
    applyBaseFields({ tax_rate: 16 }, s, false);
    expect(s.setQuoteType).toHaveBeenCalledWith("rental");
    expect(s.setCurrency).toHaveBeenCalledWith("MXN");
    expect(s.setValidUntil).toHaveBeenCalledWith(undefined);
  });
});

describe("applyLogistics", () => {
  it("activa logística cuando aparece en los items", () => {
    const s = makeState();
    applyLogistics([{ description: "Logística ida y vuelta", quantity: 1, unit_price: 1500, total: 1500 }], s);
    expect(s.setIncludeLogistics).toHaveBeenCalledWith(true);
    expect(s.setLogisticsCost).toHaveBeenCalledWith(1500);
  });

  it("no hace nada si no hay item de logística", () => {
    const s = makeState();
    applyLogistics([{ description: "Renta", quantity: 1, unit_price: 100, total: 100 }], s);
    expect(s.setIncludeLogistics).not.toHaveBeenCalled();
  });
});

describe("applySaleLines", () => {
  it("matchea modelo por manufacturer+model en la descripción", () => {
    const s = makeState();
    const items: LineItem[] = [
      { description: "Toyota 8FBE20 - Venta de equipo", quantity: 2, unit_price: 250000, total: 500000, discount: 5, discount_type: "%" },
    ];
    applySaleLines(items, models, s);
    expect(s.setSaleLines).toHaveBeenCalledWith([
      { modelId: "m1", quantity: 2, unitPrice: 250000, discount: 5, discountType: "%" },
    ]);
  });

  it("modelId vacío cuando no matchea ningún equipo", () => {
    const s = makeState();
    applySaleLines([{ description: "Otra cosa", quantity: 1, unit_price: 100, total: 100 }], models, s);
    const arg = (s.setSaleLines as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg[0].modelId).toBe("");
  });

  it("ignora cuando no hay items", () => {
    const s = makeState();
    applySaleLines([], models, s);
    expect(s.setSaleLines).not.toHaveBeenCalled();
  });
});

describe("applyRentalLines", () => {
  it("prioriza rental_meta directo", () => {
    const s = makeState();
    const meta: RentalLine[] = [
      { modelId: "m2", quantity: 1, dailyRate: 600, weeklyRate: 0, monthlyRate: 9000, discount: 0, discountType: "%" },
    ];
    applyRentalLines([], { tax_rate: 16, rental_meta: meta }, models, s);
    expect(s.setRentalLines).toHaveBeenCalledWith(meta);
  });

  it("reconstruye desde items cuando no hay rental_meta", () => {
    const s = makeState();
    const items: LineItem[] = [
      { description: "Toyota 8FBE20 renta mensual", quantity: 1, unit_price: 8000, total: 8000 },
      { description: "Toyota 8FBE20 renta semanal", quantity: 1, unit_price: 2500, total: 2500 },
    ];
    applyRentalLines(items, { tax_rate: 16 }, models, s);
    const arg = (s.setRentalLines as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).toHaveLength(1); // dedupe por modelo
    expect(arg[0]).toMatchObject({ modelId: "m1", monthlyRate: 8000, weeklyRate: 2500 });
  });

  it("no hace nada si no hay meta ni items", () => {
    const s = makeState();
    applyRentalLines([], { tax_rate: 16 }, models, s);
    expect(s.setRentalLines).not.toHaveBeenCalled();
  });
});

describe("defaultValidUntil", () => {
  it("retorna una fecha futura (≈ +30 días)", () => {
    const d = defaultValidUntil();
    const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diff).toBeGreaterThan(28);
    expect(diff).toBeLessThan(32);
  });
});
