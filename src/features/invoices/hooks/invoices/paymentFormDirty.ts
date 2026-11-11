/**
 * R23-F — ¿El diálogo de "Registrar pago" tiene cambios sin guardar?
 *
 * El modal no usa react-hook-form, así que comparamos contra los valores con
 * los que se abre. Vive fuera del hook para mantenerlo bajo el límite de
 * complejidad y poder probar la regla en aislamiento.
 */
import { toYMD } from "@/lib/format/dateFormats";

export interface PaymentFormSnapshot {
  amount: string;
  reference: string;
  notes: string;
  method: string;
  paymentFormSat: string;
  stampRep: boolean;
  exchangeRate: string;
  date?: Date;
}

export function isPaymentFormDirty(
  values: PaymentFormSnapshot,
  baseline: PaymentFormSnapshot,
): boolean {
  const changed = [
    values.amount !== baseline.amount,
    values.reference.trim() !== baseline.reference,
    values.notes.trim() !== baseline.notes,
    values.method !== baseline.method,
    values.paymentFormSat !== baseline.paymentFormSat,
    values.stampRep !== baseline.stampRep,
    values.exchangeRate !== baseline.exchangeRate,
    toYMD(values.date) !== toYMD(baseline.date),
  ];
  return changed.some(Boolean);
}
