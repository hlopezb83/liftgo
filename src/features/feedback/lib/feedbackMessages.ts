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

// Nota: el objeto agregador `successMessages` se retiró por estar sin uso.
// Los mensajes ahora viven en helpers específicos por feature.


/**
 * Convierte un estado SAT en una etiqueta amigable para mostrar al usuario.
 * Centralizado para que los toasts de cancelación CFDI / nota de crédito
 * usen el mismo lenguaje.
 */
export function satStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "accepted":
      return "Cancelación aceptada por el SAT";
    case "rejected":
      return "Cancelación rechazada. Consulta el estado del documento.";
    case "expired":
      return "La solicitud de cancelación venció. Consulta el estado del documento.";
    case "pending":
      return "Cancelación solicitada. El documento sigue vigente mientras se resuelve.";
    case "verifying":
    case "in_progress":
      return "El SAT está validando la cancelación. El documento sigue vigente.";
    case "none":
      return "No hay una solicitud de cancelación registrada.";
    case null:
    case undefined:
    case "":
    default:
      return "No se confirmó la cancelación. Consulta el estado del documento.";
  }
}
