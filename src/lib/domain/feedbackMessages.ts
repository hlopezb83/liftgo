/**
 * Catálogo central de mensajes de feedback (es-MX).
 *
 * Regla de copy: verbo en pasado + sustantivo, sin "exitosamente". Si hay
 * folio/ID disponible, incluirlo entre el sustantivo y el verbo:
 *   "Factura FAC-0001 creada"  ← OK
 *   "Factura creada exitosamente"  ← evitar
 *
 * Este módulo evita strings duplicados y mensajes vagos ("Agregado",
 * "Actualizado") que no dan contexto al usuario.
 */

export const successMessages = {
  // ---------------- Genéricos (preferir builders con contexto) ----------------
  created: (entity: string) => `${entity} creado`,
  updated: (entity: string) => `${entity} actualizado`,
  deleted: (entity: string) => `${entity} eliminado`,
  saved: (entity: string) => `${entity} guardado`,

  // ---------------- Facturas / CFDI ----------------
  invoiceCreated: (number: string) => `Factura ${number} creada`,
  invoiceStamped: (uuid?: string) =>
    uuid ? `CFDI timbrado · UUID ${uuid.slice(0, 8)}…` : "CFDI timbrado",
  invoiceCancelRequested: "Solicitud de cancelación enviada al SAT",
  invoiceCancelAccepted: "Cancelación aceptada por el SAT",
  paymentRecorded: (folio?: string) =>
    folio ? `Pago ${folio} registrado` : "Pago registrado",

  // ---------------- Notas de crédito ----------------
  creditNoteCreated: "Nota de crédito creada",
  creditNoteStamped: "Nota de crédito timbrada",
  creditNoteCancelled: "Nota de crédito cancelada",

  // ---------------- Reservas ----------------
  bookingCreated: (folio?: string) =>
    folio ? `Reserva ${folio} creada` : "Reserva creada",
  bookingCancelled: "Reserva cancelada",
  bookingExtended: "Reserva extendida",
  bookingDeleted: "Reserva eliminada",

  // ---------------- Clientes / Proveedores ----------------
  customerCreated: "Cliente creado",
  customerUpdated: "Cliente actualizado",
  supplierCreated: "Proveedor creado",
  supplierUpdated: "Proveedor actualizado",

  // ---------------- Pagos a proveedores ----------------
  supplierPaymentRecorded: "Pago a proveedor registrado",
} as const;

/**
 * Convierte un estado SAT en una etiqueta amigable para mostrar al usuario.
 * Centralizado para que los toasts de cancelación CFDI / nota de crédito
 * usen el mismo lenguaje.
 */
export function satStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "accepted":
      return "Aceptada por el SAT";
    case "rejected":
      return "Rechazada por el receptor";
    case "expired":
      return "Expirada (sin respuesta del receptor)";
    case "pending":
      return "Pendiente de aceptación del SAT";
    case "in_progress":
      return "En proceso en el SAT";
    case null:
    case undefined:
    case "":
      return "Sin estado reportado";
    default:
      return `Estado SAT: ${status}`;
  }
}
