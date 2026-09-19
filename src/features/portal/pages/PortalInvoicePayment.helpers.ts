import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";

type InvoiceLike = {
  balance?: number | string | null;
  total: number | string;
  credited_amount?: number | string | null;
  moneda?: string | null;
};

export function computeInvoiceTotals(
  invoice: InvoiceLike,
  invoicePayments: { amount: number | string }[],
  intents: { amount: number | string; status: string }[],
) {
  const totalPaid = invoicePayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const pendingReported = intents
    .filter((intent) => intent.status === "pending_review")
    .reduce((sum, intent) => sum + Number(intent.amount), 0);
  const balance = invoice.balance != null
    ? Number(invoice.balance)
    : Math.max(0, Number(invoice.total) - totalPaid - Number(invoice.credited_amount ?? 0));
  // FIX-FE-04: lo reportable descuenta lo que ya está en revisión; sin esto el
  // cliente podía reportar el saldo completo dos veces (sobrepago al aprobar).
  const reportableBalance = Math.max(0, balance - pendingReported);
  // R14-E: SPEI (CLABE MXN) sólo aplica a facturas en pesos.
  const moneda = invoice.moneda ?? "MXN";
  const isMxn = moneda === "MXN";
  const balanceLabel = formatCurrencyWithCode(balance, moneda);
  return { balance, reportableBalance, pendingReported, moneda, isMxn, balanceLabel };
}