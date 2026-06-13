import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateQuoteForm } from "../quoteFormValidation";

vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(),
}));

import { notifyError } from "@/lib/ui/appFeedback";

const mocked = vi.mocked(notifyError);

beforeEach(() => { mocked.mockClear(); });

describe("validateQuoteForm", () => {
  it("falla si falta cliente", () => {
    const ok = validateQuoteForm({
      customerId: "", quoteType: "sale", rentalLines: [], saleLines: [{ modelId: "m1", quantity: 1, unitPrice: 10 }],
    });
    expect(ok).toBe(false);
    expect(mocked).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("cliente") }));
  });

  it("rental requiere fechas", () => {
    const ok = validateQuoteForm({
      customerId: "c1", quoteType: "rental",
      rentalLines: [{ modelId: "m1", quantity: 1, dailyRate: 100, weeklyRate: 0, monthlyRate: 0 }],
      saleLines: [],
    });
    expect(ok).toBe(false);
    expect(mocked).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("periodo") }));
  });

  it("rental requiere al menos un modelo con tarifa", () => {
    const ok = validateQuoteForm({
      customerId: "c1", quoteType: "rental",
      startDate: new Date(2026, 0, 1), endDate: new Date(2026, 0, 31),
      rentalLines: [{ modelId: "m1", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 0 }],
      saleLines: [],
    });
    expect(ok).toBe(false);
    expect(mocked).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("tarifas") }));
  });

  it("sale requiere modelo + cantidad + precio", () => {
    const ok = validateQuoteForm({
      customerId: "c1", quoteType: "sale", rentalLines: [],
      saleLines: [{ modelId: "m1", quantity: 0, unitPrice: 100 }],
    });
    expect(ok).toBe(false);
  });

  it("retorna true en un rental válido", () => {
    const ok = validateQuoteForm({
      customerId: "c1", quoteType: "rental",
      startDate: new Date(2026, 0, 1), endDate: new Date(2026, 0, 31),
      rentalLines: [{ modelId: "m1", quantity: 1, dailyRate: 100, weeklyRate: 0, monthlyRate: 0 }],
      saleLines: [],
    });
    expect(ok).toBe(true);
    expect(mocked).not.toHaveBeenCalled();
  });

  it("retorna true en un sale válido", () => {
    const ok = validateQuoteForm({
      customerId: "c1", quoteType: "sale", rentalLines: [],
      saleLines: [{ modelId: "m1", quantity: 2, unitPrice: 500 }],
    });
    expect(ok).toBe(true);
  });
});
