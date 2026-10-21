import { roundMoney, sumMoney } from "@/lib/money";
import { convertCurrencyAmount } from "./paymentCurrency";

interface SourceInvoice {
  id: string;
  organization_id?: string | null;
  customer_id?: string | null;
  invoice_number: string;
  total: number;
  moneda: string | null;
  tipo_cambio: number | string | null;
  status: string;
  cancellation_status?: string | null;
}
interface SourcePayment {
  id: string;
  invoice_id: string;
  amount: number;
  currency?: string | null;
  exchange_rate?: number | string | null;
  payment_date: string;
  reference_number?: string | null;
  rep_cfdi_uuid?: string | null;
}
interface SourceCredit {
  id: string;
  invoice_id: string;
  customer_id?: string | null;
  credit_note_number: string;
  total: number;
  currency?: string | null;
  cfdi_status: string | null;
  status: string;
  cancellation_status: string | null;
}

export interface InvoiceCreditBalance {
  invoiceId: string;
  customerId: string | null;
  organizationId: string | null;
  invoiceNumber: string;
  currency: string;
  exchangeRate: number | string | null;
  invoiceTotal: number;
  paid: number;
  credited: number;
  netInvoiced: number;
  /** Current evidence only, NOT an available-to-apply ledger balance. */
  excess: number | null;
  issue: "missing_fx" | "invalid_source" | "inactive_invoice" | null;
  payments: Array<{
    id: string; reference: string; date: string; amount: number; currency: string;
    exchangeRate: number | string | null; converted: number | null; repUuid: string | null;
  }>;
  credits: Array<{ id: string; number: string; amount: number; currency: string }>;
}

const currencyCode = (value: string | null | undefined) => (value ?? "MXN").toUpperCase();
const usableMoney = (value: number) => Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100));

/**
 * Read-only projection of an already-authorized, fully loaded invoice scope.
 * A note reduces the invoiced amount once; it is not a second cash receipt.
 * Reuses the same per-payment FX rounding as the invoice balance and MEJ005.
 * No allocation, refund, source mutation, aggregate across customers or MXN fallback.
 */
export function computeInvoiceCreditBalance(
  invoice: SourceInvoice,
  payments: readonly SourcePayment[],
  creditNotes: readonly SourceCredit[],
): InvoiceCreditBalance {
  const currency = currencyCode(invoice.moneda);
  const active = creditNotes.filter((note) => note.cfdi_status === "stamped" &&
    note.status !== "cancelled" && note.cancellation_status !== "accepted");
  let invalid = !/^[A-Z]{3}$/.test(currency) || !usableMoney(Number(invoice.total));
  const paymentIds = new Set<string>();
  const creditIds = new Set<string>();
  const paymentTrace = payments.flatMap((payment) => {
    const amount = Number(payment.amount);
    const sourceCurrency = currencyCode(payment.currency ?? currency);
    if (!payment.id || paymentIds.has(payment.id) || payment.invoice_id !== invoice.id) {
      invalid = true;
      return [];
    }
    if (!usableMoney(amount) || !/^[A-Z]{3}$/.test(sourceCurrency)) invalid = true;
    paymentIds.add(payment.id);
    return [{
      id: payment.id, reference: payment.reference_number || payment.id, date: payment.payment_date,
      amount, currency: sourceCurrency, exchangeRate: payment.exchange_rate ?? null,
      converted: convertCurrencyAmount(amount, sourceCurrency, currency, payment.exchange_rate, invoice.tipo_cambio),
      repUuid: payment.rep_cfdi_uuid ?? null,
    }];
  });
  const credits = active.flatMap((note) => {
    if (!note.id || creditIds.has(note.id) || note.invoice_id !== invoice.id ||
      (note.customer_id != null && invoice.customer_id != null && note.customer_id !== invoice.customer_id)) {
      invalid = true;
      return [];
    }
    const sourceCurrency = currencyCode(note.currency ?? currency);
    if (sourceCurrency !== currency || !usableMoney(Number(note.total))) invalid = true;
    creditIds.add(note.id);
    return [{ id: note.id, number: note.credit_note_number, amount: Number(note.total), currency: sourceCurrency }];
  });
  const paid = sumMoney(paymentTrace.map((payment) => payment.converted));
  const credited = sumMoney(credits.map((note) => note.amount));
  const invoiceTotal = roundMoney(Number(invoice.total));
  const netInvoiced = roundMoney(invoiceTotal - credited);
  invalid ||= !usableMoney(paid) || !usableMoney(credited) || netInvoiced < 0;
  const issue = invalid ? "invalid_source"
    : ["draft", "cancelled"].includes(invoice.status) || invoice.cancellation_status === "accepted" ? "inactive_invoice"
      : paymentTrace.some((payment) => payment.converted === null) ? "missing_fx" : null;
  return {
    invoiceId: invoice.id, customerId: invoice.customer_id ?? null, organizationId: invoice.organization_id ?? null,
    invoiceNumber: invoice.invoice_number, currency, exchangeRate: invoice.tipo_cambio,
    invoiceTotal, paid, credited, netInvoiced,
    excess: issue ? null : Math.max(0, roundMoney(paid - netInvoiced)),
    issue, payments: paymentTrace, credits,
  };
}
