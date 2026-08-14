import { renderHook, act } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, it, expect } from "vitest";
import {
  buildEmptyInvoiceValues,
  type InvoiceFormValues,
} from "../../../lib/invoiceFormSchema";
import { useInvoiceFormTotals } from "../useInvoiceFormTotals";

/**
 * M1-03: el preview de totales debe respetar `objeto_imp` (exento "01" no
 * genera IVA) y `tax_rate` por línea — mismo criterio que `computeTotals`
 * usa en el submit/timbrado. Antes el mapping descartaba ambos campos.
 */
function setupHook(defaultValues?: Partial<InvoiceFormValues>) {
  return renderHook(() => {
    const form = useForm<InvoiceFormValues>({
      defaultValues: { ...buildEmptyInvoiceValues(), ...defaultValues },
    });
    const totals = useInvoiceFormTotals(form);
    return { form, totals };
  });
}

describe("useInvoiceFormTotals", () => {
  it("línea objeto_imp='01' (exenta) no genera IVA", () => {
    const { result } = setupHook({
      taxRate: 16,
      lineItems: [
        { description: "Gravada", quantity: 1, unit_price: 100, total: 100, objeto_imp: "02" },
        { description: "Exenta", quantity: 1, unit_price: 50, total: 50, objeto_imp: "01" },
      ] as InvoiceFormValues["lineItems"],
    });
    // Solo la línea gravada genera IVA: 100 * 16% = 16
    expect(result.current.totals.subtotal).toBe(150);
    expect(result.current.totals.taxAmount).toBe(16);
    expect(result.current.totals.total).toBe(166);
  });

  it("tax_rate por línea gana sobre la tasa global", () => {
    const { result } = setupHook({
      taxRate: 16,
      lineItems: [
        { description: "Tasa especial", quantity: 1, unit_price: 100, total: 100, objeto_imp: "02", tax_rate: 8 },
      ] as InvoiceFormValues["lineItems"],
    });
    expect(result.current.totals.taxAmount).toBe(8);
    expect(result.current.totals.total).toBe(108);
  });

  it("sin objeto_imp/tax_rate por línea usa la tasa global (comportamiento previo intacto)", () => {
    const { result } = setupHook({
      taxRate: 16,
      lineItems: [
        { description: "Simple", quantity: 2, unit_price: 100, total: 200, objeto_imp: "02" },
      ] as InvoiceFormValues["lineItems"],
    });
    expect(result.current.totals.subtotal).toBe(200);
    expect(result.current.totals.taxAmount).toBe(32);
    expect(result.current.totals.total).toBe(232);
  });

  it("recalcula cuando cambian las líneas del formulario", () => {
    const { result } = setupHook({ taxRate: 16, lineItems: [] });
    expect(result.current.totals.total).toBe(0);
    act(() => {
      result.current.form.setValue("lineItems", [
        { description: "Nueva", quantity: 1, unit_price: 100, total: 100, objeto_imp: "01" },
      ] as InvoiceFormValues["lineItems"]);
    });
    expect(result.current.totals.taxAmount).toBe(0);
    expect(result.current.totals.total).toBe(100);
  });
});
