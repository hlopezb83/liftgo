/**
 * M-22: guarda anti-bucle para la recarga por chunk stale.
 *
 * Antes la llave `vite-preload-reload` se borraba en cada evento `load`:
 * si el deploy seguía sirviendo un chunk obsoleto, la página recargaba en
 * bucle infinito (error → reload → load borra la llave → error → reload…).
 *
 * Ahora se persiste `{ ts, count }` en sessionStorage:
 *  - Sólo se permite recargar si la última recarga fue hace más de
 *    `RELOAD_WINDOW_MS` (ventana de enfriamiento), o si no se ha llegado al
 *    máximo de intentos consecutivos dentro de la ventana.
 *  - Tras `MAX_RELOADS` recargas dentro de la ventana, se rinde (no recarga)
 *    y la UI de error existente ofrece recarga manual.
 */

const RELOAD_KEY = "vite-preload-reload";
const RELOAD_WINDOW_MS = 30_000;
const MAX_RELOADS = 2;

/**
 * Patrones que indican que el navegador quedó con un bundle obsoleto tras un
 * deploy. Además de los fallos de fetch clásicos, incluimos el caso en que el
 * chunk sí carga pero evalúa a `undefined`: `React.lazy` lee `.default` del
 * módulo y lanza "Cannot read properties of undefined (reading 'default')"
 * (Safari: "undefined is not an object (evaluating '...default')").
 */
const STALE_CHUNK_PATTERNS = [
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
  "ChunkLoadError",
  "Cannot read properties of undefined (reading 'default')",
  "Cannot read property 'default' of undefined",
  "undefined is not an object (evaluating",
];

/** `true` si el mensaje de error corresponde a un chunk obsoleto/roto. */
export function isStaleChunkMessage(message: string | undefined | null): boolean {
  if (!message) return false;
  if (message.includes("undefined is not an object (evaluating")) {
    return message.includes("default");
  }
  return STALE_CHUNK_PATTERNS.some((pattern) => message.includes(pattern));
}


interface ReloadGuardState {
  ts: number;
  count: number;
}

function readState(): ReloadGuardState | null {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReloadGuardState> | null;
    if (!parsed || typeof parsed.ts !== "number" || !Number.isFinite(parsed.ts)) return null;
    const count = typeof parsed.count === "number" && Number.isFinite(parsed.count) ? parsed.count : 1;
    return { ts: parsed.ts, count };
  } catch {
    return null;
  }
}

function writeState(state: ReloadGuardState): void {
  try {
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage no disponible (modo privado extremo, etc.) — recargar
    // igualmente; peor caso es un bucle que el navegador termina cortando.
  }
}

/**
 * Intenta recargar por chunk stale respetando la guarda anti-bucle.
 * Devuelve `true` si se disparó `window.location.reload()`.
 */
export function reloadForStaleChunk(): boolean {
  const now = Date.now();
  const prev = readState();
  // Fuera de la ventana de 30s el contador se reinicia (el deploy pudo
  // estabilizarse; una recarga aislada es segura).
  const consecutive = prev && now - prev.ts <= RELOAD_WINDOW_MS ? prev.count : 0;
  if (consecutive >= MAX_RELOADS) return false; // rendirse: no recargar más
  writeState({ ts: now, count: consecutive + 1 });
  window.location.reload();
  return true;
}

/** Limpia la guarda (p.ej. antes de una recarga manual explícita del usuario). */
export function clearStaleChunkReloadGuard(): void {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* noop */
  }
}