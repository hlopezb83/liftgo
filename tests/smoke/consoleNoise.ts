/**
 * Clasificación del ruido de consola del smoke de arranque.
 *
 * El problema que resuelve: Chromium emite el error de transporte como
 * `Failed to load resource: net::ERR_FAILED`, un texto que NO contiene la URL.
 * Correlacionarlo con la lista de peticiones que el propio spec abortó exige
 * mirar `ConsoleMessage.location().url`, que sí la trae.
 *
 * Regla: se ignora ÚNICAMENTE el error de transporte demostrablemente causado
 * por una petición externa que esta prueba bloqueó. Un asset del origen de la
 * app, un error sin atribución (sin URL) o cualquier error que no sea de
 * transporte (React, hidratación, etc.) siempre falla.
 */

/** Entrada mínima de un error de consola, desacoplada de Playwright. */
export interface ConsoleErrorEntry {
  readonly text: string;
  /** `ConsoleMessage.location().url`; puede venir vacío. */
  readonly url?: string;
}

export interface NoiseContext {
  /** Origen exacto de la app bajo prueba. */
  readonly origin: string;
  /** URLs que ESTE spec abortó, ya normalizadas. */
  readonly blocked: ReadonlySet<string>;
}

export interface NoiseVerdict {
  readonly ignored: boolean;
  /** Diagnóstico legible; siempre incluye la URL (o su ausencia). */
  readonly diagnostic: string;
}

/**
 * Errores de carga de red de Chromium. Deliberadamente acotado: no incluye
 * mensajes de aplicación (`Failed to fetch`, errores de Supabase), que deben
 * fallar aunque nazcan de una petición bloqueada — indican que la app no
 * maneja el fallo.
 */
const TRANSPORT_ERROR = /^Failed to load resource:\s*net::[A-Z_]+/;

/**
 * Normaliza para comparar: el hash nunca viaja al servidor y una URL inválida
 * se deja tal cual para que no colisione con nada.
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

export function classifyConsoleError(
  entry: ConsoleErrorEntry,
  ctx: NoiseContext,
): NoiseVerdict {
  const where = entry.url ? entry.url : "sin URL atribuida";
  const diagnostic = `${entry.text} [${where}]`;

  if (!TRANSPORT_ERROR.test(entry.text)) return { ignored: false, diagnostic };
  if (!entry.url) return { ignored: false, diagnostic };

  const normalized = normalizeUrl(entry.url);

  let sameOrigin = false;
  try {
    sameOrigin = new URL(normalized).origin === ctx.origin;
  } catch {
    sameOrigin = false;
  }
  // Asset propio roto: exactamente el fallo de empaquetado que este smoke
  // persigue. Nunca se ignora, aunque el texto sea idéntico al del ruido.
  if (sameOrigin) return { ignored: false, diagnostic };

  if (ctx.blocked.has(normalized)) return { ignored: true, diagnostic };

  // Externa pero no atribuible a un bloqueo nuestro: sin causa demostrada, falla.
  return { ignored: false, diagnostic };
}
