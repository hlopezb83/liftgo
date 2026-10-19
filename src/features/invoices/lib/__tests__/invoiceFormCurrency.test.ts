import { describe, expect, it } from "vitest";
import { buildEmptyInvoiceValues, invoiceFormSchema } from "../invoiceFormSchema";

function receiverEdit(moneda: string) {
  const values = buildEmptyInvoiceValues();
  return {
    ...values,
    customerId: "synthetic-customer",
    lineItems: [{ description: "Synthetic service", quantity: 1, unit_price: 100, total: 100 }],
    taxRate: 0,
    cfdi: { ...values.cfdi, moneda, tipoCambio: 17.5, receptorRazonSocial: "SYNTHETIC RECEIVER" },
  };
}

describe("invoice currency before saving receiver edits", () => {
  it.each(["", "   "])("rejects an empty currency %j even with a valid exchange rate", (currency) => {
    const result = invoiceFormSchema.safeParse(receiverEdit(currency));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "cfdi.moneda")).toBe(true);
    }
  });

  it.each(["MXN", "USD", "EUR"])("preserves valid %s receiver edits and amounts", (currency) => {
    const result = invoiceFormSchema.parse(receiverEdit(currency));
    expect(result.cfdi.moneda).toBe(currency);
    expect(result.cfdi.tipoCambio).toBe(17.5);
    expect(result.lineItems[0]).toMatchObject({ quantity: 1, unit_price: 100, total: 100 });
  });
});
