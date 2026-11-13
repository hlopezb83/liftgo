import { describe, expect, it } from "vitest";
import { getPaymentMethodLabel } from "@/features/invoices/lib/paymentMethods";

/**
 * R8-FE-19 (BL-R8-28): historial de pagos debe traducir payment_method
 * (transfer/cash/check/card) usando el mapa correcto del feature de
 * facturas, no PAYMENT_METHOD_LABELS de CxP (vocabulario distinto).
 */
describe("traducción de método de pago (R8-FE-19)", () => {
  it("traduce los 4 valores reales de payments.payment_method", () => {
    expect(getPaymentMethodLabel("transfer")).toBe("Transferencia");
    expect(getPaymentMethodLabel("cash")).toBe("Efectivo");
    expect(getPaymentMethodLabel("check")).toBe("Cheque");
    expect(getPaymentMethodLabel("card")).toBe("Tarjeta");
  });

  it("no interpreta códigos SAT como métodos operativos", () => {
    expect(getPaymentMethodLabel("03")).toBe("03");
    expect(getPaymentMethodLabel("PPD")).toBe("PPD");
  });

  it("conserva valores desconocidos y representa los vacíos sin inventar un método", () => {
    expect(getPaymentMethodLabel("wire")).toBe("wire");
    expect(getPaymentMethodLabel(null)).toBe("—");
    expect(getPaymentMethodLabel(undefined)).toBe("—");
    expect(getPaymentMethodLabel("")).toBe("—");
  });
});
