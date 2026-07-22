import { extractErrorDetails } from "@/lib/ui/errorDetailsExtract";

/**
 * Tabla de regex → mensaje amigable en español mexicano para errores comunes.
 * Se aplica sobre el mensaje crudo extraído del error.
 */
const FRIENDLY_ERROR_MESSAGES: Array<{ pattern: RegExp; message: string }> = [
  // R8 Bloque 6·#12: mensajes específicos por constraint ANTES del catch-all de duplicado.
  { pattern: /drivers_name_unique/i, message: "Ya existe un operador con ese nombre." },
  { pattern: /forklifts_serial_number_unique/i, message: "Ya existe un montacargas con ese número de serie." },
  { pattern: /equipment_models_mfr_model_unique/i, message: "Ya existe un modelo con ese fabricante y modelo." },
  { pattern: /customers_rfc_unique/i, message: "Ya existe un cliente con ese RFC." },
  { pattern: /duplicate key|already exists|23505/i, message: "Ya existe un registro con esos datos." },
  { pattern: /violates row-level security|permission denied|42501/i, message: "No tienes permisos para esta acción." },
  { pattern: /foreign key|23503/i, message: "No se puede completar: hay registros relacionados." },
  { pattern: /failed to fetch|networkerror|load failed/i, message: "Sin conexión. Verifica tu internet." },
  { pattern: /jwt expired|invalid token|not authenticated/i, message: "Tu sesión expiró. Inicia sesión nuevamente." },
  { pattern: /rate limit|too many requests|429/i, message: "Demasiadas solicitudes. Intenta en unos momentos." },
  { pattern: /not found|pgrst116/i, message: "El registro no existe o fue eliminado." },
  { pattern: /overlap|ya está reservado/i, message: "El equipo ya está reservado en ese rango." },
];

/**
 * Extrae un mensaje legible de cualquier valor `unknown` y lo traduce a un
 * mensaje amigable si coincide con alguno de los patrones conocidos.
 */
export function getErrorMessage(err: unknown): string {
  const details = extractErrorDetails(err);
  const raw = details.message || "Ocurrió un error inesperado.";

  for (const { pattern, message } of FRIENDLY_ERROR_MESSAGES) {
    if (pattern.test(raw)) return message;
  }
  return raw;
}
