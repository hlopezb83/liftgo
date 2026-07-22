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
