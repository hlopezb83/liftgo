import { describe, expect, it, vi } from "vitest";
import { computeInvoiceTotals } from "./PortalInvoicePayment.helpers";
import {
  ForeignCurrencyNotice,
  InvoiceNotFound,
  MxnPaymentSection,
  PaidCard,
  PaymentBody,
  PaymentQueryError,
  PortalIntentsTable,
} from "./PortalInvoicePaymentParts";

describe("PortalInvoicePaymentParts", () => {
  it("conserva las piezas extraídas que compone la página", () => {
    expect([
      PortalIntentsTable,
      ForeignCurrencyNotice,
      MxnPaymentSection,
      PaidCard,
      PaymentQueryError,
      InvoiceNotFound,
      PaymentBody,
    ]).toEqual(expect.arrayContaining([expect.any(Function)]));
  });

  it("descuenta pagos y notas de crédito cuando no hay saldo canónico", () => {
    expect(computeInvoiceTotals(
      { total: "1500", credited_amount: "200", moneda: "MXN" },
      [{ amount: "400" }],
      [],
    )).toMatchObject({ balance: 900, reportableBalance: 900, pendingReported: 0, moneda: "MXN", isMxn: true });
  });

  it("conserva el saldo canónico y descuenta sólo reportes pendientes del monto reportable", () => {
    expect(computeInvoiceTotals(
      { total: 2000, balance: "1000", moneda: "USD" },
      [{ amount: 800 }],
      [
        { amount: "600", status: "pending_review" },
        { amount: "500", status: "approved" },
        { amount: "700", status: "pending_review" },
      ],
    )).toMatchObject({ balance: 1000, reportableBalance: 0, pendingReported: 1300, moneda: "USD", isMxn: false });
  });

  it("mantiene MXN como moneda predeterminada", () => {
    const result = computeInvoiceTotals({ total: 100 }, [], []);
    expect(result.moneda).toBe("MXN");
    expect(result.isMxn).toBe(true);
  });

});