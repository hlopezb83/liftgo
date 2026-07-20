import { act, renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useQuoteForm } from "../useQuoteForm";
import { buildPrefillValues, useQuotePrefill, type EquipmentModel, type ExistingQuote } from "../useQuotePrefill";

const models: EquipmentModel[] = [
  { id: "m1", manufacturer: "Toyota", model: "8FGCU25", default_daily_rate: 500, default_weekly_rate: 3000, default_monthly_rate: 12000 },
];

const existingRental: ExistingQuote = {
  id: "q-1",
  quote_type: "rental",
  customer_id: "c-1",
  customer_name: "Cliente Uno",
  start_date: "2026-02-01",
  end_date: "2026-02-28",
  tax_rate: 16,
  currency: "MXN",
  notes: "prueba",
  valid_until: "2026-03-01",
  line_items: [],
  rental_meta: [
    { modelId: "m1", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 12000, discount: 0, discountType: "%" },
  ],
};

describe("buildPrefillValues", () => {
  it("mapea una cotización de renta existente al shape del form", () => {
    const v = buildPrefillValues(existingRental, models);
    expect(v.quoteType).toBe("rental");
    expect(v.customerId).toBe("c-1");
    expect(v.rentalLines).toHaveLength(1);
    expect(v.rentalLines[0].monthlyRate).toBe(12000);
    expect(v.dateRange?.from?.getFullYear()).toBe(2026);
    expect(v.currency).toBe("MXN");
    expect(v.taxRate).toBe("16");
  });

  it("detecta logística cuando la línea existe", () => {
    const q = { ...existingRental, line_items: [{ description: "Servicio de Logística", quantity: 1, unit_price: 5000, total: 5000 }] };
    const v = buildPrefillValues(q, models);
    expect(v.includeLogistics).toBe(true);
    expect(v.logisticsCost).toBe(5000);
  });
});

describe("useQuotePrefill", () => {
  it("prefill de cotización existente NO marca isDirty (blindaje del guard)", () => {
    const { result } = renderHook(() => {
      const form = useQuoteForm();
      useQuotePrefill({ existingQuote: existingRental, equipmentModels: models, form });
      return form;
    });
    expect(result.current.formState.isDirty).toBe(false);
    expect(result.current.getValues("customerId")).toBe("c-1");
  });

  it("no re-hidrata cuando el mismo existingQuote llega otra vez (no pisa cambios del usuario)", () => {
    const form = renderHook(() => {
      const f = useQuoteForm();
      useQuotePrefill({ existingQuote: existingRental, equipmentModels: models, form: f });
      return f;
    });
    act(() => form.result.current.setValue("customerName", "Editado", { shouldDirty: true }));
    // Re-render con misma referencia
    form.rerender();
    expect(form.result.current.getValues("customerName")).toBe("Editado");
  });
});
