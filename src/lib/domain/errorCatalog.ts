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

const MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: "Los datos no son válidos. Revisa los campos marcados.",
  DB_PERMISSION_DENIED: "No tienes permisos para realizar esta acción.",
  DB_UNIQUE_VIOLATION: "Ya existe un registro con esos datos.",
  DB_FOREIGN_KEY: "No se puede completar la operación porque hay registros relacionados.",
  NETWORK_ERROR: "Sin conexión. Verifica tu internet e intenta de nuevo.",
  AUTH_REQUIRED: "Tu sesión expiró. Inicia sesión nuevamente.",
  NOT_FOUND: "El recurso solicitado no existe o fue eliminado.",
  RATE_LIMITED: "Demasiadas solicitudes. Espera un momento e intenta de nuevo.",
  INTERNAL_ERROR: "Ocurrió un error en el servidor. Inténtalo más tarde.",
  UNKNOWN: "Ocurrió un error inesperado.",
  BOOKING_OVERLAP: "El equipo ya está reservado en ese rango de fechas.",
  FORKLIFT_UNAVAILABLE: "El equipo {forkliftId} no está disponible.",
  MAINTENANCE_BLOCK: "No se puede agendar mantenimiento durante una reserva activa (buffer de 3 días).",
  QUOTE_NOT_EDITABLE: "Esta cotización ya no se puede editar en su estado actual.",
  QUOTE_GENERIC_CUSTOMER: "Reasigna el cliente 'Público en General' antes de convertir la cotización.",
  INVOICE_ALREADY_PAID: "Esta factura ya fue pagada en su totalidad.",
  INVOICE_CANCELLED: "Esta factura está cancelada y no admite cambios.",
  CFDI_FACTURAPI_ERROR: "Facturapi rechazó el CFDI: {detail}",
  MODELS_REQUIRED: "Primero debes definir los modelos de equipo en Configuración.",
  PAYMENT_EXCEEDS_BALANCE: "El pago excede el saldo pendiente de la factura.",
  RECURRING_BILLING_LOCKED: "La facturación recurrente para este periodo ya fue generada.",
  ROLE_FORBIDDEN: "Tu rol no permite esta acción.",
};



