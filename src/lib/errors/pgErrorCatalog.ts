import { extractErrorDetails } from "@/lib/ui/errorDetailsExtract";
import {
  CONSTRAINT_MESSAGES,
  PRIORITY_TEXT_PATTERNS,
  SQLSTATE_MESSAGES,
  TEXT_PATTERNS,
  WARNING_SQLSTATES,
} from "./pgErrorCatalog.data";
import type { CatalogEntry, ErrorSeverity } from "./pgErrorCatalog.data";

/**
 * Catálogo de errores de Postgres/PostgREST → mensajes accionables en es-MX.
 *
 * Resolución en tres niveles, en este orden:
 *   1. Nombre de la restricción (unique index, check, exclusion, FK).
 *   2. SQLSTATE estructurado (`error.code`, o el código embebido en el texto).
 *   3. Patrones de texto libre (último recurso, compatibilidad histórica).
 *
 * Solo el nivel 1 y 2 se consideran "match estructurado"; el nivel 3 existe
 * porque muchos errores llegan como string plano desde Edge Functions.
 *
 * Los datos estáticos del catálogo viven en `pgErrorCatalog.data.ts`; esta
 * fachada conserva la API pública y el algoritmo de resolución.
 */

export interface PgErrorTranslation {
  title: string;
  message: string;
  severity: ErrorSeverity;
  /** true si se reconoció por constraint, SQLSTATE o patrón conocido. */
  matched: boolean;
  /** Nombre de la restricción detectada, si la hubo. */
  constraint?: string;
  /** SQLSTATE detectado, si lo hubo. */
  sqlstate?: string;
}

// Reexportaciones de compatibilidad: consumidores como
// `src/features/suppliers/hooks/useSuppliers.ts` importan desde esta ruta.
export { CONSTRAINT_MESSAGES, SQLSTATE_MESSAGES };

// ---------------------------------------------------------------------------
// Resolución
// ---------------------------------------------------------------------------

/** Texto donde buscar nombres de restricción y códigos: message + details + hint. */
function haystack(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" | ");
}

function findConstraint(text: string): string | undefined {
  for (const name of Object.keys(CONSTRAINT_MESSAGES)) {
    if (text.includes(name)) return name;
  }
  return undefined;
}

/** Detecta el SQLSTATE, ya sea estructurado o embebido en el texto. */
function findSqlstate(code: string | undefined, text: string): string | undefined {
  if (code && (SQLSTATE_MESSAGES[code] || code === "P0001")) return code;
  for (const key of Object.keys(SQLSTATE_MESSAGES)) {
    if (text.includes(key)) return key;
  }
  return undefined;
}

function findTextEntry(text: string): CatalogEntry | undefined {
  for (const { pattern, entry } of TEXT_PATTERNS) {
    if (pattern.test(text)) return entry;
  }
  return undefined;
}

function build(entry: CatalogEntry, fallbackTitle: string, extra: Partial<PgErrorTranslation>): PgErrorTranslation {
  return {
    title: entry.title ?? fallbackTitle,
    message: entry.message,
    severity: entry.severity ?? "critical",
    matched: true,
    ...extra,
  };
}

/**
 * Traduce cualquier error (PostgrestError, Error, string, respuesta de Edge
 * Function) a un mensaje accionable. Si nada coincide devuelve `matched:false`
 * y el mensaje crudo, para que el caller decida el fallback.
 */
export function translatePgError(error: unknown, fallbackTitle = "Error"): PgErrorTranslation {
  const details = extractErrorDetails(error);
  const text = haystack([details.message, details.details, details.hint]);

  const constraint = findConstraint(text);
  if (constraint) {
    const entry = CONSTRAINT_MESSAGES[constraint];
    return build({ severity: "warning", ...entry }, fallbackTitle, { constraint });
  }

  for (const { pattern, entry } of PRIORITY_TEXT_PATTERNS) {
    if (pattern.test(text)) return build(entry, fallbackTitle, {});
  }

  const sqlstate = findSqlstate(details.code, text);
  if (sqlstate === "P0001") {
    // `RAISE EXCEPTION` de nuestros triggers: el mensaje ya viene redactado
    // para el usuario final, así que se muestra tal cual.
    return {
      title: fallbackTitle,
      message: details.message || "No se pudo completar la operación.",
      severity: "warning",
      matched: true,
      sqlstate,
    };
  }
  if (sqlstate) {
    const entry = SQLSTATE_MESSAGES[sqlstate];
    const severity: ErrorSeverity = entry.severity ?? (WARNING_SQLSTATES.has(sqlstate) ? "warning" : "critical");
    return build({ ...entry, severity }, fallbackTitle, { sqlstate });
  }

  const textEntry = findTextEntry(text);
  if (textEntry) return build(textEntry, fallbackTitle, {});

  return {
    title: fallbackTitle,
    message: details.message || "Ocurrió un error inesperado.",
    severity: "critical",
    matched: false,
  };
}
