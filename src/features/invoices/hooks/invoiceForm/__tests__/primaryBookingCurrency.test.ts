import { describe, expect, it, vi } from "vitest";
import { applyPrimaryCurrency } from "../useInvoiceFormHandlers";
import type { InvoiceFormValues } from "../../../lib/invoiceFormSchema";
import type { UseFormReturn } from "react-hook-form";

describe("moneda de la reserva primaria", () => {
  it("reemplaza USD/TC previo por MXN/1 al seleccionar una reserva MXN", () => {
    const setValue = vi.fn();
    const form = { setValue } as unknown as UseFormReturn<InvoiceFormValues>;
    applyPrimaryCurrency(form, { id: "usd", forklift_id: "unit", start_date: "2026-10-01", end_date: "2026-10-02", currency: "USD", tipo_cambio: 18.5 });
    applyPrimaryCurrency(form, { id: "mxn", forklift_id: "unit", start_date: "2026-10-01", end_date: "2026-10-02", currency: "MXN", tipo_cambio: 1 });
    expect(setValue).toHaveBeenLastCalledWith("cfdi.tipoCambio", 1, { shouldDirty: true });
    expect(setValue).toHaveBeenCalledWith("cfdi.moneda", "MXN", { shouldDirty: true });
  });

  it("vacía el tipo de cambio foráneo inválido para que valide en lugar de conservar el anterior", () => {
    const setValue = vi.fn();
    const form = { setValue } as unknown as UseFormReturn<InvoiceFormValues>;
    applyPrimaryCurrency(form, { id: "usd", forklift_id: "unit", start_date: "2026-10-01", end_date: "2026-10-02", currency: "USD", tipo_cambio: null });
    expect(setValue).toHaveBeenCalledWith("cfdi.tipoCambio", 0, { shouldDirty: true });
  });
});
