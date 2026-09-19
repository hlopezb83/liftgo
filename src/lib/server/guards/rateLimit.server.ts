/**
 * Rate limiting de los server functions administrativos (server-only).
 *
 * Token bucket en base. Fail-closed (SEC-M4): si el RPC falla, se rechaza.
 * `check_and_record_rate_limit` sólo es ejecutable por service_role.
 */
import { type AdminClient, HttpError } from "./httpError";

export async function enforceRateLimit(
  admin: AdminClient,
  bucket: string,
  identifier: string,
  maxRequests = 10,
  windowSeconds = 60,
): Promise<void> {
  const { data, error } = await admin.rpc("check_and_record_rate_limit", {
    _bucket: bucket,
    _identifier: identifier,
    _max_requests: maxRequests,
    _window_seconds: windowSeconds,
  });

  if (error) {
    console.error(`[rateLimit:${bucket}] RPC error, fail-closed:`, error.message);
    throw new HttpError(
      503,
      "Servicio de control de acceso no disponible. Reintenta en unos segundos.",
    );
  }

  if (data === false) {
    throw new HttpError(
      429,
      `Demasiadas peticiones. Espera unos segundos antes de reintentar (límite ${maxRequests}/${windowSeconds}s).`,
    );
  }
}
