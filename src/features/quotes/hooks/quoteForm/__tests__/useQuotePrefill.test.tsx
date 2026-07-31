import { act, renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useQuoteForm } from "../useQuoteForm";
import { buildPrefillValues, useQuotePrefillValues, type EquipmentModel, type ExistingQuote } from "../useQuotePrefill";

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

  it("R9VTA-04: cotización legacy sin rental_meta y con descripción libre conserva tarifas/precio históricos", () => {
    const legacy: ExistingQuote = {
      ...existingRental,
      rental_meta: undefined,
      line_items: [
        { description: "Renta montacargas", quantity: 2, unit_price: 750, total: 1500 },
      ],
    };
    const v = buildPrefillValues(legacy, models);
    expect(v.rentalLines).toHaveLength(1);
    // Sin match de modelo: modelId vacío, pero NO se pierde la data histórica.
    expect(v.rentalLines[0].modelId).toBe("");
    expect(v.rentalLines[0].quantity).toBe(2);
    expect(v.rentalLines[0].dailyRate).toBe(750);
  });
});

describe("useQuotePrefillValues", () => {
  it("devuelve undefined mientras las queries no resuelven (isSuccess=false) — no pisa defaults", () => {
    const { result } = renderHook(() =>
      useQuotePrefillValues({ existingQuote: existingRental, equipmentModels: models, quoteReady: false, modelsReady: true }),
    );
    expect(result.current).toBeUndefined();
  });

  it("BL-R8-08: hidrata cuando existingQuote/equipmentModels llegan tarde (después del primer render)", () => {
    const { result, rerender } = renderHook(
      (props: { existingQuote: ExistingQuote | undefined; equipmentModels: EquipmentModel[] | undefined; quoteReady: boolean; modelsReady: boolean }) =>
        useQuotePrefillValues(props),
      { initialProps: { existingQuote: undefined, equipmentModels: undefined, quoteReady: false, modelsReady: false } },
    );
    // Primer render: sin data, sin queries listas — el form debe quedarse con sus defaults.
    expect(result.current).toBeUndefined();

    // La query de la cotización resuelve, pero equipmentModels todavía no (navegación SPA).
    rerender({ existingQuote: existingRental, equipmentModels: undefined, quoteReady: true, modelsReady: false });
    expect(result.current).toBeUndefined();

    // ~500ms después: ambas queries resuelven.
    rerender({ existingQuote: existingRental, equipmentModels: models, quoteReady: true, modelsReady: true });
    expect(result.current).toBeDefined();
    expect(result.current?.customerId).toBe("c-1");
    expect(result.current?.rentalLines[0].monthlyRate).toBe(12000);
  });

  it("no recalcula (misma referencia) cuando el mismo quoteId llega de nuevo — no pisa ediciones del usuario", () => {
    const { result, rerender } = renderHook(
      (props: { existingQuote: ExistingQuote; equipmentModels: EquipmentModel[] }) =>
        useQuotePrefillValues({ ...props, quoteReady: true, modelsReady: true }),
      { initialProps: { existingQuote: existingRental, equipmentModels: models } },
    );
    const first = result.current;
    expect(first).toBeDefined();

    // Refetch con nuevas referencias de objeto pero mismo id de cotización.
    rerender({ existingQuote: { ...existingRental }, equipmentModels: [...models] });
    expect(result.current).toBe(first);
  });

  it("recalcula cuando cambia el quoteId (otra cotización)", () => {
    const other: ExistingQuote = { ...existingRental, id: "q-2", customer_name: "Otro Cliente" };
    const { result, rerender } = renderHook(
      (props: { existingQuote: ExistingQuote; equipmentModels: EquipmentModel[] }) =>
        useQuotePrefillValues({ ...props, quoteReady: true, modelsReady: true }),
      { initialProps: { existingQuote: existingRental, equipmentModels: models } },
    );
    expect(result.current?.customerName).toBe("Cliente Uno");
    rerender({ existingQuote: other, equipmentModels: models });
    expect(result.current?.customerName).toBe("Otro Cliente");
  });
});

describe("useQuoteForm con values reactivos", () => {
  it("prefill de cotización existente NO marca isDirty (blindaje del guard)", () => {
    const { result } = renderHook(() => useQuoteForm(buildPrefillValues(existingRental, models)));
    expect(result.current.formState.isDirty).toBe(false);
    expect(result.current.getValues("customerId")).toBe("c-1");
  });

  it("no re-hidrata (no pisa cambios del usuario) cuando `values` conserva la misma referencia", () => {
    const values = buildPrefillValues(existingRental, models);
    const { result, rerender } = renderHook(() => useQuoteForm(values));
    act(() => result.current.setValue("customerName", "Editado", { shouldDirty: true }));
    rerender();
    expect(result.current.getValues("customerName")).toBe("Editado");
  });
});
