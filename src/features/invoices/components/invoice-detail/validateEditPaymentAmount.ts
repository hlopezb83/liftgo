import { roundMoney } from "@/lib/money";
import { convertCurrencyAmount } from "../../lib/paymentCurrency";

interface PaymentCurrencyContext {
  invoiceCurrency?: string | null;
  invoiceExchangeRate?: number | string | null;
  paymentCurrency?: string | null;
  paymentExchangeRate?: number | string | null;
}

type ValidationResult = { ok: true }
  | { ok: false; maxAllowed: number }
  | { ok: false; reason: "missing_exchange_rate" };

/**
 * M3-01: valida el tope BL-11 al editar un pago — el monto nuevo no puede
 * exceder el saldo actual (en moneda de factura) más la contribución original
 * del pago en esa misma moneda. El máximo se convierte a moneda de pago para
 * compararlo con el nuevo importe y mostrarlo, con tolerancia de 0.01.
 * Con REP timbrado el servidor
 * rechaza cambios de monto/fecha; el cliente no debe ni intentar validarlos
 * (se ignoran, siempre pasa).
 */
export function validateEditPaymentAmount(
  newAmount: number,
  balance: number,
  originalAmount: number,
  isRepStamped: boolean,
  context: PaymentCurrencyContext = {},
): ValidationResult {
  if (isRepStamped) return { ok: true };
  const invoiceCurrency = context.invoiceCurrency ?? "MXN";
  const paymentCurrency = context.paymentCurrency ?? invoiceCurrency;
  const originalInInvoiceCurrency = convertCurrencyAmount(
    originalAmount, paymentCurrency, invoiceCurrency,
    context.paymentExchangeRate, context.invoiceExchangeRate,
  );
  if (originalInInvoiceCurrency === null) return { ok: false, reason: "missing_exchange_rate" };
  const maxAllowed = convertCurrencyAmount(
    roundMoney(balance + originalInInvoiceCurrency), invoiceCurrency, paymentCurrency,
    context.invoiceExchangeRate, context.paymentExchangeRate,
  );
  if (maxAllowed === null) return { ok: false, reason: "missing_exchange_rate" };
  if (roundMoney(roundMoney(newAmount) - maxAllowed) > 0.01) {
    return { ok: false, maxAllowed };
  }
  return { ok: true };
}

