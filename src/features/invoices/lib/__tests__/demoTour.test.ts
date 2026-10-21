import { describe, expect, it } from "vitest";
import { isDemoInvoice, verifyDemoScenario, type DemoInvoice, type DemoPayment } from "../demoTour";

const invoice: DemoInvoice = {
  id: "invoice-a", organization_id: "org-a", invoice_number: "QA-001", customer_name: "QA DEMO Cliente",
  status: "paid", total: 116, moneda: "MXN", tipo_cambio: 1, issued_at: "2026-10-01",
  cfdi_status: "stamped", facturapi_env: "test", cancellation_status: "none", is_e2e: false,
};
const payment = (amount: number, extra: Partial<DemoPayment> = {}): DemoPayment => ({
  id: "payment-a", amount, currency: "MXN", exchange_rate: 1, payment_date: "2026-10-03", ...extra,
});

describe("demo fixtures", () => {
  it("accepts a same-organization QA/DEMO fixture without making its label an access grant", () => {
    expect(isDemoInvoice(invoice, "org-a")).toBe(true);
    expect(isDemoInvoice(invoice, "org-b")).toBe(false);
    expect(isDemoInvoice({ ...invoice, customer_name: "Cliente DEMO-Parcial" }, "org-a")).toBe(true);
    expect(isDemoInvoice({ ...invoice, customer_name: "DEMOGRAFIA" }, "org-a")).toBe(false);
    expect(isDemoInvoice({ ...invoice, customer_name: "Cliente operativo" }, "org-a")).toBe(false);
  });

  it.each([
    { status: "draft" }, { status: "cancelled" }, { cancellation_status: "accepted" },
    { cfdi_status: "cancelled" }, { facturapi_env: "live" }, { facturapi_env: null },
    { is_e2e: true }, { total: 0 }, { total: Number.NaN },
    { moneda: "USD", tipo_cambio: null }, { moneda: "USD", tipo_cambio: 1 },
  ])("rejects unsuitable fixtures %j", (fields) => {
    expect(isDemoInvoice({ ...invoice, ...fields }, "org-a")).toBe(false);
  });

  it("verifies paid, partial and pending from actual payments as well as status", () => {
    expect(verifyDemoScenario(invoice, [payment(116)], "paid")).toMatchObject({ paid: 116, balance: 0 });
    expect(verifyDemoScenario({ ...invoice, status: "partial" }, [payment(50)], "partial"))
      .toMatchObject({ paid: 50, balance: 66 });
    expect(verifyDemoScenario({ ...invoice, status: "sent" }, [], "pending"))
      .toMatchObject({ paid: 0, balance: 116 });
    expect(verifyDemoScenario({ ...invoice, status: "overdue" }, [], "pending")).not.toBeNull();
    expect(verifyDemoScenario(invoice, [], "paid")).toBeNull();
    expect(verifyDemoScenario({ ...invoice, status: "partial" }, [payment(116)], "partial")).toBeNull();
    expect(verifyDemoScenario({ ...invoice, status: "sent" }, [payment(10)], "pending")).toBeNull();
  });

  it("uses the existing payment-currency rules and does not hide missing conversion", () => {
    expect(verifyDemoScenario(invoice, [payment(5.8, { currency: "USD", exchange_rate: 20 })], "paid"))
      .toMatchObject({ paid: 116, balance: 0 });
    expect(verifyDemoScenario(invoice, [payment(5.8, { currency: "USD", exchange_rate: null })], "paid")).toBeNull();
    expect(verifyDemoScenario(invoice, [payment(-5)], "paid")).toBeNull();
    expect(verifyDemoScenario(invoice, [payment(Number.NaN)], "paid")).toBeNull();
    expect(verifyDemoScenario(invoice, [payment(117)], "paid")).toBeNull();
  });
});
