/**
 * Persistencia selectiva de la cache de TanStack Query en `localStorage`.
 *
 * Whitelist estricta: sólo persistimos queries "seguras" (datos de
 * catálogos, dashboards, KPIs) que aceleran el cold start sin exponer
 * información sensible.
 *
 * NO persistir: roles, permisos, secretos, sesiones, tokens ni datos
 * financieros.
 *
 * Multi-organización (tramo 2): la caché persistida se guarda bajo una clave
 * por identidad verificada (`liftgo:rq-cache:v4:{usuario}:{organización}:{tipo}`).
 * Las claves globales anteriores se purgan: podían restaurar catálogos de otro
 * usuario u otra empresa.
 */
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { isForeignPersistedCacheKey, persistedCacheKey, PERSIST_KEY_PREFIX } from "./identityScope";
import type { Query } from "@tanstack/react-query";

// Claves globales (sin identidad) de versiones anteriores: se eliminan siempre.
const LEGACY_STORAGE_KEYS = [
  "liftgo:rq-cache:v1",
  "liftgo:rq-cache:v2",
  "liftgo:rq-cache:v3",
] as const;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Borra cachés persistidas globales y las de cualquier otra identidad.
 * Idempotente; se llama al montar la persistencia y en cada cambio de sesión.
 */
export function purgeForeignPersistedCaches(storage: Storage, scope: string | null) {
  try {
    for (const key of LEGACY_STORAGE_KEYS) storage.removeItem(key);

    const foreign: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && isForeignPersistedCacheKey(key, scope)) foreign.push(key);
    }
    for (const key of foreign) storage.removeItem(key);
  } catch {
    // storage bloqueado (modo privado, políticas): no romper el arranque.
  }
}

export { PERSIST_KEY_PREFIX, persistedCacheKey };

/**
 * Prefijos de queryKey que se persisten en disco.
 *
 * R-arq DIFF 5: la lista anterior tenía roots que no coinciden con ningún
 * factory real (`inventory` ≠ `parts_inventory`, `contract-templates` ≠
 * `contracts`, `cash-flow-settings` ≠ `cash_flow_settings`, `financial-kpis`
 * y `mrr` ≠ `dashboard-financial-kpis`/`dashboard-mrr-detail`). El test
 * `persister.test.ts` valida que cada entrada match a un factory real para
 * evitar volver a divergir tras un rename.
 */
export const PERSIST_ALLOWLIST: readonly string[] = [
  // Dashboard KPIs y agregados. `dashboard-activity-feed` queda excluido a
  // propósito (dato muy dinámico). SEC-B7: los KPIs financieros, el detalle
  // MRR, contratos, cash-flow settings y estados de resultados NO se
  // persisten — datos financieros sensibles no deben quedar en localStorage.
  // Catálogos operativos
  "equipment_models",
  "drivers",
  "mechanics",
  "forklifts",
  "parts_inventory",
  "insurance-alerts",
  // Configuración pública / branding
  "changelog",
  "public_branding",
  "user-manual",
  "user-manual-versions",
];
// NOTA: `customers`, `suppliers` y `prospects` NO se persisten (PII).

/** Prefijos EXPLÍCITAMENTE bloqueados (defensa en profundidad). */
export const PERSIST_BLOCKLIST: readonly string[] = [
  // Auth / roles / permisos
  "user_role",
  "user_roles",
  "users",
  "role_permissions",
  "auth",
  "session",
  "user",
  // Secretos y credenciales
  "billing_secrets_status",
  "billing-secrets",
  "pac-config",
  // Portal cliente
  "portal",
  // SEC-B7: datos financieros / contractuales sensibles
  "income_statement",
  "dashboard-financial-kpis",
  "dashboard-mrr-detail",
  "contracts",
  "cash_flow_settings",
  // F5: `overdue_invoices` dentro de dashboard-stats trae customer_name/balance (PII financiera).
  "dashboard-stats",
  // Auditoría / feedback (datos volátiles o sensibles)
  "audit",
  "audit_log",
  "feedback_reports",
  "feedback_history",
  "feedback_leaderboard",
];

export function shouldPersistQuery(query: Query): boolean {
  // v7.226.0 · E2E-N13: queries en vuelo no deben persistirse — al rehidratar
  // llegan sin data y provocan errores del tipo "promise.then is not a function".
  if (query.state?.status === "pending") return false;
  const root = query.queryKey[0];
  if (typeof root !== "string") return false;
  if (PERSIST_BLOCKLIST.includes(root)) return false;
  return PERSIST_ALLOWLIST.includes(root);
}

/**
 * Persister ligado a una identidad verificada. Sin identidad (`scope` nulo)
 * devuelve un persister en memoria: nada se restaura ni se escribe en disco
 * antes de que la sesión y la organización estén resueltas.
 */
export function createBrowserPersister(scope: string | null) {
  const inMemory = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };

  if (typeof window === "undefined" || !scope) {
    return createSyncStoragePersister({
      storage: inMemory,
      key: scope ? persistedCacheKey(scope) : `${PERSIST_KEY_PREFIX}:anonymous`,
      throttleTime: 1000,
    });
  }

  purgeForeignPersistedCaches(window.localStorage, scope);
  return createSyncStoragePersister({
    storage: window.localStorage,
    key: persistedCacheKey(scope),
    throttleTime: 1000,
  });
}

export const PERSIST_MAX_AGE_MS = MAX_AGE_MS;
