/**
 * Catálogo unificado de códigos de error para LiftGo.
 * Núcleo (transporte/DB) + dominio (operación). Mensajes en es-MX con
 * interpolación opcional `{var}`.
 */
export const ERROR_CODES = {
  // Núcleo
  VALIDATION_FAILED: "VALIDATION_FAILED",
  DB_PERMISSION_DENIED: "DB_PERMISSION_DENIED",
  DB_UNIQUE_VIOLATION: "DB_UNIQUE_VIOLATION",
  DB_FOREIGN_KEY: "DB_FOREIGN_KEY",
  NETWORK_ERROR: "NETWORK_ERROR",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  UNKNOWN: "UNKNOWN",
  // Dominio LiftGo
  BOOKING_OVERLAP: "BOOKING_OVERLAP",
  FORKLIFT_UNAVAILABLE: "FORKLIFT_UNAVAILABLE",
  MAINTENANCE_BLOCK: "MAINTENANCE_BLOCK",
  QUOTE_NOT_EDITABLE: "QUOTE_NOT_EDITABLE",
  QUOTE_GENERIC_CUSTOMER: "QUOTE_GENERIC_CUSTOMER",
  INVOICE_ALREADY_PAID: "INVOICE_ALREADY_PAID",
  INVOICE_CANCELLED: "INVOICE_CANCELLED",
  CFDI_FACTURAPI_ERROR: "CFDI_FACTURAPI_ERROR",
  MODELS_REQUIRED: "MODELS_REQUIRED",
  PAYMENT_EXCEEDS_BALANCE: "PAYMENT_EXCEEDS_BALANCE",
  RECURRING_BILLING_LOCKED: "RECURRING_BILLING_LOCKED",
  ROLE_FORBIDDEN: "ROLE_FORBIDDEN",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Mensajes canónicos por `ErrorCode` en es-MX. Permite que edge functions o
 * mutaciones incluyan un `errorCode` estable y que la UI muestre siempre el
 * mismo copy, sin depender del texto crudo del backend (que puede variar por
 * versión, idioma o proveedor).
 *
 * Uso: `notifyError({ error, errorCode: ERROR_CODES.INVOICE_ALREADY_PAID })`
 * o directamente `translateByCode(code)` cuando se quiera el string plano.
 */
const CODE_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: "Los datos capturados no son válidos.",
  DB_PERMISSION_DENIED: "No tienes permisos para esta acción.",
  DB_UNIQUE_VIOLATION: "Ya existe un registro con esos datos.",
  DB_FOREIGN_KEY: "No se puede completar: hay registros relacionados.",
  NETWORK_ERROR: "Sin conexión. Verifica tu internet.",
  AUTH_REQUIRED: "Tu sesión expiró. Inicia sesión nuevamente.",
  NOT_FOUND: "El registro no existe o fue eliminado.",
  RATE_LIMITED: "Demasiadas solicitudes. Intenta en unos momentos.",
  INTERNAL_ERROR: "Ocurrió un error interno. Intenta de nuevo.",
  UNKNOWN: "Ocurrió un error inesperado.",
  BOOKING_OVERLAP: "El equipo ya está reservado en ese rango.",
  FORKLIFT_UNAVAILABLE: "El montacargas no está disponible.",
  MAINTENANCE_BLOCK: "El equipo tiene mantenimiento programado en ese periodo.",
  QUOTE_NOT_EDITABLE: "La cotización no está en un estado editable.",
  QUOTE_GENERIC_CUSTOMER: "Reasigna la cotización a un cliente específico antes de continuar.",
  INVOICE_ALREADY_PAID: "La factura ya está pagada.",
  INVOICE_CANCELLED: "La factura está cancelada.",
  CFDI_FACTURAPI_ERROR: "Error al timbrar el CFDI ante el PAC.",
  MODELS_REQUIRED: "Registra al menos un modelo de equipo antes de continuar.",
  PAYMENT_EXCEEDS_BALANCE: "El monto excede el saldo pendiente.",
  RECURRING_BILLING_LOCKED: "La facturación recurrente está bloqueada para este ciclo.",
  ROLE_FORBIDDEN: "Tu rol no tiene acceso a esta operación.",
};

/**
 * Devuelve el mensaje canónico en es-MX para un `ErrorCode`. Si el código no
 * está registrado, devuelve el mensaje de `UNKNOWN`.
 */
export function translateByCode(code: ErrorCode | null | undefined): string {
  if (!code) return CODE_MESSAGES.UNKNOWN;
  return CODE_MESSAGES[code] ?? CODE_MESSAGES.UNKNOWN;
}





