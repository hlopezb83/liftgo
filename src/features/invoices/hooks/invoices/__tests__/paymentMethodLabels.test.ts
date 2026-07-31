import { describe, expect, it } from "vitest";
import { PAYMENT_METHODS } from "@/features/invoices/lib/paymentMethods";

/**
 * R8-FE-19 (BL-R8-28): historial de pagos debe traducir payment_method
 * (transfer/cash/check/card) usando el mapa correcto del feature de
 * facturas, no PAYMENT_METHOD_LABELS de CxP (vocabulario distinto).
 */
const PAYMENT_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m.label]),
);

function displayPaymentMethod(method: string | null): string {
  return (method && PAYMENT_METHOD_LABELS[method]) || method || "—";
}

describe("traducción de método de pago (R8-FE-19)", () => {
  it("traduce los 4 valores reales de payments.payment_method", () => {
    expect(displayPaymentMethod("transfer")).toBe("Transferencia");
    expect(displayPaymentMethod("cash")).toBe("Efectivo");
    expect(displayPaymentMethod("check")).toBe("Cheque");
    expect(displayPaymentMethod("card")).toBe("Tarjeta");
  });

  it("nunca muestra el valor crudo en inglés para un método conocido", () => {
    expect(displayPaymentMethod("transfer")).not.toBe("transfer");
  });

  it("cae al valor crudo si el método es desconocido, y a '—' si es null", () => {
    expect(displayPaymentMethod("wire")).toBe("wire");
    expect(displayPaymentMethod(null)).toBe("—");
  });
});
