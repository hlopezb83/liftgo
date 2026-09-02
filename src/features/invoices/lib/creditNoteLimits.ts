/**
 * Resumen del tope de notas de crédito de una factura (BL-08 + H-5).
 * Extraído del componente para mantenerlo simple y poder probarlo aparte.
 */
import { sumMoney } from "@/lib/money";
import { computeMaxCreditable } from "./computeMaxCreditable";
import { isRepBacked, repBackedPayments, sumRepBackedPaymentsInInvoiceCurrency } from "./repBackedPayments";
import type { CreditNote } from "../hooks/creditNotes/useCreditNotes";
import type { Payment } from "../hooks/usePayments";

export interface CreditNoteLimits {
  activeCredits: number;
  draftCredits: number;
  repBacked: number;
  repPayments: Payment[];
  /** Cobrado sin complemento de pago vigente (genera saldo a favor). */
  otherPaid: number;
  maxCreditable: number;
  /** El tope quedó en cero por complementos de pago vigentes. */
  blockedByReps: boolean;
  /** Acreditar generaría saldo a favor del cliente. */
  willCreateCredit: boolean;
  /**
   * FIX-1 (ronda 2): REP vigentes en moneda distinta sin tipo de cambio. Con
   * uno solo el tope es incalculable → se bloquea la emisión (fail-closed).
   */
  fxMissingReps: number;
  blockedByMissingFx: boolean;
}

/** Moneda y tipo de cambio de la factura, para convertir los pagos al mismo piso. */
export interface InvoiceCurrencyInfo {
  moneda?: string | null;
  tipo_cambio?: number | string | null;
}

export function computeCreditNoteLimits(
  invoiceTotal: number,
  creditNotes: readonly CreditNote[],
  payments: readonly Payment[],
  invoiceCurrency: InvoiceCurrencyInfo = {},
): CreditNoteLimits {
  // B-7: sumas monetarias con sumMoney (sin drift IEEE-754) y comparación con
  // epsilon de medio centavo (convención del repo, ver cashFlowTransformers).
  const activeCredits = sumMoney(
    creditNotes
      .filter((cn) => cn.cfdi_status === "stamped" && cn.cancellation_status !== "accepted" && cn.status !== "cancelled")
      .map((cn) => Number(cn.total)),
  );
  const draftCredits = sumMoney(
    creditNotes.filter((cn) => cn.status === "draft").map((cn) => Number(cn.total)),
  );

  // H-5: los pagos con REP timbrado y vigente sí topan la NC.
  // FIX-1 (ronda 2): convertidos a la moneda de la factura, nunca 1:1.
  const repPayments = repBackedPayments(payments);
  const { total: repBacked, fxMissing: fxMissingReps } = sumRepBackedPaymentsInInvoiceCurrency(
    payments,
    invoiceCurrency.moneda,
    invoiceCurrency.tipo_cambio,
  );
  const otherPaid = sumMoney(
    payments.filter((p) => !isRepBacked(p)).map((p) => Number(p.amount) || 0),
  );

  const maxCreditable = computeMaxCreditable(Number(invoiceTotal), activeCredits, draftCredits, repBacked);

  return {
    activeCredits,
    draftCredits,
    repBacked,
    repPayments,
    otherPaid,
    maxCreditable,
    blockedByReps: repBacked > 0.005 && maxCreditable <= 0.005,
    willCreateCredit: otherPaid > 0.005 && maxCreditable > 0.005,
    fxMissingReps,
    blockedByMissingFx: fxMissingReps > 0,
  };
}

