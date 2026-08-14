import { roundMoney } from "@/lib/money";

/**
 * M3-01: valida el tope BL-11 al editar un pago — el monto nuevo no puede
 * exceder el saldo actual (que ya incluye este pago) más el monto original
 * del pago editado, con tolerancia de 0.01. Con REP timbrado el servidor
 * rechaza cambios de monto/fecha; el cliente no debe ni intentar validarlos
 * (se ignoran, siempre pasa).
 */
export function validateEditPaymentAmount(
  newAmount: number,
  balance: number,
  originalAmount: number,
  isRepStamped: boolean,
): { ok: true } | { ok: false; maxAllowed: number } {
  if (isRepStamped) return { ok: true };
  const maxAllowed = roundMoney(balance + originalAmount);
  if (roundMoney(newAmount) - maxAllowed > 0.01) {
    return { ok: false, maxAllowed };
  }
  return { ok: true };
}

