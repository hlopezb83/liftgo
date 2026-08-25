/**
 * Resumen del tope de notas de crédito de una factura (BL-08 + H-5).
 * Extraído del componente para mantenerlo simple y poder probarlo aparte.
 */
import { sumMoney } from "@/lib/money";
import type { CreditNote } from "../hooks/creditNotes/useCreditNotes";
import type { Payment } from "../hooks/usePayments";
import { computeMaxCreditable } from "./computeMaxCreditable";
import { isRepBacked, repBackedPayments, sumRepBackedPayments } from "./repBackedPayments";

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
}

export function computeCreditNoteLimits(
  invoiceTotal: number,
  creditNotes: readonly CreditNote[],
  payments: readonly Payment[],
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
  const repPayments = repBackedPayments(payments);
  const repBacked = sumRepBackedPayments(payments);
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
  };
}
