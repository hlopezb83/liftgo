/**
 * Multi-organización · Fase 5 (tramo 2): identidad de caché.
 *
 * Toda la caché —en memoria y persistida— se separa por identidad verificada:
 * usuario autenticado + organización resuelta en servidor (+ tipo de miembro,
 * porque el mismo usuario nunca cambia de tipo pero la clave debe ser
 * inequívoca). Nunca se usa un `organization_id` propuesto por el navegador.
 */

export interface VerifiedIdentity {
  userId: string;
  organizationId: string;
  memberType: "internal" | "portal";
}

/** Clave estable de identidad, o `null` mientras no esté verificada. */
export function buildIdentityScope(identity: VerifiedIdentity | null): string | null {
  if (!identity) return null;
  const { userId, organizationId, memberType } = identity;
  if (!userId || !organizationId) return null;
  return `${userId}:${organizationId}:${memberType}`;
}

/** Clave de almacenamiento persistido para una identidad verificada. */
export const PERSIST_KEY_PREFIX = "liftgo:rq-cache:v4";

export function persistedCacheKey(scope: string): string {
  return `${PERSIST_KEY_PREFIX}:${scope}`;
}

/** ¿La clave de almacenamiento corresponde a otra identidad? */
export function isForeignPersistedCacheKey(storageKey: string, scope: string | null): boolean {
  if (!storageKey.startsWith(`${PERSIST_KEY_PREFIX}:`)) return false;
  return scope === null || storageKey !== persistedCacheKey(scope);
}

/**
 * Raíz de la consulta que resuelve la propia identidad: nunca se purga junto
 * con los datos de la sesión anterior, porque volver a limpiarla al refetchear
 * dejaría la aplicación en un ciclo de verificación.
 */
export const IDENTITY_QUERY_ROOT = "organization-context";

export function isIdentityQueryKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === IDENTITY_QUERY_ROOT;
}
