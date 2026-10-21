/**
 * Máximo acreditable vía Nota de Crédito para una factura.
 *
 * BL-08 (v7.90.0): los pagos, por sí solos, NO limitan cuánto se puede
 * acreditar. Fiscalmente la NC se relaciona con la factura, no con el saldo
 * pendiente, y una devolución/bonificación de una factura ya pagada es válida
 * ante el SAT (genera saldo a favor del cliente).
 *
 * H-5 (v7.334.0): sí topan los pagos respaldados por un complemento de pago
 * (REP) timbrado y vigente. Ese REP ya declaró ante el SAT un importe pagado
 * contra la factura; acreditar por debajo de esa suma deja el CFDI
 * inconsistente. La secuencia correcta es cancelar el REP —hasta 72 h de
 * espera ante el SAT— y luego emitir la NC. El mismo tope lo aplica el
 * disparador `enforce_credit_note_max` en base de datos.
 *
 * Nota de negocio: cuando hay pagos SIN REP vigente, la NC puede dejar saldo a
 * favor del cliente. Hoy no hay flujo de reembolso implementado; queda como
 * feature pendiente ("saldo a favor / devoluciones").
 */
import { roundMoney } from "@/lib/money";

export function computeMaxCreditable(
  invoiceTotal: number,
  activeCredits: number,
  draftCredits: number,
  repBackedPayments = 0,
): number {
  const total = Number(invoiceTotal) || 0;
  const active = Number(activeCredits) || 0;
  const draft = Number(draftCredits) || 0;
  const repBacked = Number(repBackedPayments) || 0;
  // B-7: redondear a 2 decimales monetarios — con float crudo un total
  // exactamente cubierto por las NC devolvía drift (10.21−5.11−5.10 =
  // 8.88e-16 > 0) y la UI ofrecía crear una NC por $0.00.
  return Math.max(0, roundMoney(total - active - draft - repBacked));
}
