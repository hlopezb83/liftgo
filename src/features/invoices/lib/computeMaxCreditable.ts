/**
 * Máximo acreditable vía Nota de Crédito para una factura.
 *
 * BL-08 (revisado, v7.90.0): los pagos NO limitan cuánto se puede acreditar.
 * Fiscalmente la NC se relaciona con la factura, no con el saldo pendiente,
 * y una devolución/bonificación de una factura ya pagada es válida ante el SAT.
 * Solo se restan las NC ya emitidas (stamped) y los borradores para evitar
 * emitir por más del total de la factura.
 *
 * Nota de negocio: al levantar el tope por pagos, una NC puede generar saldo a
 * favor del cliente. Hoy no hay flujo de reembolso implementado; queda como
 * feature pendiente ("saldo a favor / devoluciones").
 */
import { roundMoney } from "@/lib/money";

export function computeMaxCreditable(
  invoiceTotal: number,
  activeCredits: number,
  draftCredits: number,
): number {
  const total = Number(invoiceTotal) || 0;
  const active = Number(activeCredits) || 0;
  const draft = Number(draftCredits) || 0;
  // B-7: redondear a 2 decimales monetarios — con float crudo un total
  // exactamente cubierto por las NC devolvía drift (10.21−5.11−5.10 =
  // 8.88e-16 > 0) y la UI ofrecía crear una NC por $0.00.
  return roundMoney(total - active - draft);
}
