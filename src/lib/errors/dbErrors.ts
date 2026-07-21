/**
 * Traductores de errores de base de datos → mensajes de usuario.
 *
 * EC-M4 (v7.121.0): el trigger `bump_version_optimistic` levanta un
 * `RAISE EXCEPTION 'stale_write: ...'` cuando dos usuarios editan el mismo
 * registro. Aquí lo convertimos a un mensaje accionable en español y en
 * severidad `warning` para no espantar con un modal crítico.
 */

const STALE_WRITE_MESSAGE =
  "Este registro fue modificado en otra pestaña o por otro usuario. Recarga los datos para ver los cambios más recientes.";

const OVERLAP_MESSAGE =
  "Las fechas se traslapan con otra reserva o con mantenimiento programado.";

export interface TranslatedDbError {
  title: string;
  message: string;
  severity: "critical" | "warning";
  matched: boolean;
}

function extractRawMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const anyErr = error as { message?: unknown; details?: unknown };
    if (typeof anyErr.message === "string") return anyErr.message;
    if (typeof anyErr.details === "string") return anyErr.details;
  }
  return "";
}

/**
 * Devuelve un mensaje traducido para errores conocidos de la DB.
 * Si no matchea nada conocido, `matched=false` y el caller puede seguir su
 * flujo normal (notifyError con el error original).
 */
export function translateDbError(
  error: unknown,
  fallbackTitle: string,
): TranslatedDbError {
  const raw = extractRawMessage(error);

  if (raw.includes("stale_write")) {
    return {
      title: "Cambios no guardados",
      message: STALE_WRITE_MESSAGE,
      severity: "warning",
      matched: true,
    };
  }

  // BL-A2: la exclusion constraint `no_overlapping_bookings` (SQLSTATE 23P01)
  // es la red de seguridad de extend_booking/create_booking ante carreras.
  // El mensaje crudo de Postgres ("conflicting key value violates exclusion
  // constraint") no es accionable; se traduce a copy de negocio.
  if (
    raw.includes("no_overlapping_bookings") ||
    raw.includes("23P01") ||
    raw.toLowerCase().includes("exclusion constraint")
  ) {
    return {
      title: fallbackTitle,
      message: OVERLAP_MESSAGE,
      severity: "warning",
      matched: true,
    };
  }

  return {
    title: fallbackTitle,
    message: raw,
    severity: "critical",
    matched: false,
  };
}
