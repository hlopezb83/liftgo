/**
 * R23-F — ¿El diálogo de "Registrar pago" tiene cambios sin guardar?
 *
 * El modal no usa react-hook-form, así que comparamos contra los valores con
 * los que se abre. Vive fuera del hook para mantenerlo bajo el límite de
 * complejidad y poder probar la regla en aislamiento.
 */
import { toYMD } from "@/lib/format/dateFormats";
import { nowMty } from "@/lib/utils";
import { satCodeForMethod } from "../../lib/paymentMethods";

export const DEFAULT_PAYMENT_METHOD = "transfer";

export interface PaymentFormSnapshot {
  amount: string;
  reference: string;
  notes: string;
  method: string;
  paymentFormSat: string;
  stampRep: boolean;
  date: Date;
}

export interface PaymentFormBaseline {
  balance: number;
  ppdStamped: boolean;
}

export function isPaymentFormDirty(
  values: PaymentFormSnapshot,
  baseline: PaymentFormBaseline,
): boolean {
  const changed = [
    values.amount !== baseline.balance.toFixed(2),
    values.reference.trim() !== "",
    values.notes.trim() !== "",
    values.method !== DEFAULT_PAYMENT_METHOD,
    values.paymentFormSat !== satCodeForMethod(DEFAULT_PAYMENT_METHOD),
    values.stampRep !== baseline.ppdStamped,
    toYMD(values.date) !== toYMD(nowMty()),
  ];
  return changed.some(Boolean);
}
