import type { Tables } from "@/integrations/supabase/types";
import { roundMoney } from "@/lib/money";
import { convertCurrencyAmount, sumPaymentsInInvoiceCurrency, type PaymentLike } from "./paymentCurrency";

export const DEMO_SCENARIOS = {
  paid: { label: "Pagado", expected: "Cobros por el total de la factura y saldo cero." },
  partial: { label: "Parcial", expected: "Cobros mayores que cero, menores que el total y saldo pendiente." },
  pending: { label: "Pendiente", expected: "Sin cobros; el saldo pendiente coincide con el total." },
} as const;
export type DemoScenario = keyof typeof DEMO_SCENARIOS;
export type DemoInvoice = Pick<Tables<"invoices">,
  "id" | "organization_id" | "invoice_number" | "customer_name" | "status" | "total" |
  "moneda" | "tipo_cambio" | "issued_at" | "cfdi_status" | "facturapi_env" | "cancellation_status" | "is_e2e"
>;
export type DemoPayment = PaymentLike & { id: string; payment_date: string };
export type DemoEvidence = { invoice: DemoInvoice; payments: DemoPayment[]; paid: number; balance: number };

/** A label is only a fixture convention, never an authorization boundary. RLS
 * and verified organization scope must apply before this predicate is used. */
export function isDemoInvoice(invoice: DemoInvoice, organizationId: string): boolean {
  return invoice.organization_id === organizationId && invoice.is_e2e !== true &&
    /(^|[^a-z0-9])(qa|demo)(?=$|[^a-z0-9])/i.test(invoice.customer_name ?? "") &&
    ["sent", "partial", "paid", "overdue"].includes(invoice.status) &&
    invoice.cancellation_status !== "accepted" && invoice.cfdi_status !== "cancelled" &&
    invoice.facturapi_env !== "live" &&
    (invoice.cfdi_status !== "stamped" || invoice.facturapi_env === "test") &&
    Number.isFinite(Number(invoice.total)) && Number(invoice.total) > 0 &&
    convertCurrencyAmount(Number(invoice.total), invoice.moneda, "MXN", invoice.tipo_cambio, 1) !== null;
}

export function verifyDemoScenario(
  invoice: DemoInvoice, payments: DemoPayment[], scenario: DemoScenario,
): DemoEvidence | null {
  // A demo fixture must be simple and explainable; missing FX or invalid payment
  // amounts must never be silently interpreted as an unpaid invoice.
  if (!Number.isFinite(Number(invoice.total)) || Number(invoice.total) <= 0) return null;
  if (payments.some((payment) => !Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0)) return null;
  const { totalPaid, unconvertible } = sumPaymentsInInvoiceCurrency(payments, invoice.moneda, invoice.tipo_cambio);
  if (unconvertible) return null;
  const total = roundMoney(Number(invoice.total));
  const balance = roundMoney(total - totalPaid);
  const matches = scenario === "paid"
    ? invoice.status === "paid" && totalPaid > 0 && balance === 0
    : scenario === "partial"
      ? invoice.status === "partial" && totalPaid > 0 && balance > 0
      : ["sent", "overdue"].includes(invoice.status) && payments.length === 0 && balance === total;
  return matches ? { invoice, payments, paid: totalPaid, balance } : null;
}
