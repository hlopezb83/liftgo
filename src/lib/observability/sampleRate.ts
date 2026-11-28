/**
 * Resuelve un `tracesSampleRate` en `[0, 1]` desde una variable de entorno.
 * Cualquier valor ausente o fuera de rango conserva `fallback`.
 */
export function resolveSampleRate(raw: unknown, fallback: number): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const parsed = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return fallback;
  return parsed;
}
