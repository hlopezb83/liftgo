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
export function computeMaxCreditable(
  invoiceTotal: number,
  activeCredits: number,
  draftCredits: number,
): number {
  const total = Number(invoiceTotal) || 0;
  const active = Number(activeCredits) || 0;
  const draft = Number(draftCredits) || 0;
  return total - active - draft;
}
