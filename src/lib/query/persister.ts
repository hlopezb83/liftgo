/**
 * Persistencia selectiva de la cache de TanStack Query en `localStorage`.
 *
 * Whitelist estricta: sólo persistimos queries "seguras" (datos de
 * catálogos, dashboards, KPIs) que aceleran el cold start sin exponer
 * información sensible.
 *
 * NO persistir: roles, permisos, secretos, sesiones, tokens.
 */
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { Query } from "@tanstack/react-query";

const STORAGE_KEY = "liftgo:rq-cache:v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

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
  // propósito — dato muy dinámico, no vale la pena persistirlo.
  "dashboard-stats",
  "dashboard-mrr-detail",
  "dashboard-financial-kpis",
  // Catálogos operativos
  "equipment_models",
  "drivers",
  "mechanics",
  "forklifts",
  "parts_inventory",
  "contracts",
  "insurance-alerts",
  // Configuración pública / branding
  "changelog",
  "public_branding",
  "cash_flow_settings",
  "income_statement",
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
  // Auditoría / feedback (datos volátiles o sensibles)
  "audit",
  "audit_log",
  "feedback_reports",
  "feedback_history",
  "feedback_leaderboard",
];

export function shouldPersistQuery(query: Query): boolean {
  const root = query.queryKey[0];
  if (typeof root !== "string") return false;
  if (PERSIST_BLOCKLIST.includes(root)) return false;
  return PERSIST_ALLOWLIST.includes(root);
}

export function createBrowserPersister() {
  if (typeof window === "undefined") {
    // Fallback en memoria (no-op) para SSR/tests.
    return createSyncStoragePersister({
      storage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      key: STORAGE_KEY,
      throttleTime: 1000,
    });
  }
  return createSyncStoragePersister({
    storage: window.localStorage,
    key: STORAGE_KEY,
    throttleTime: 1000,
  });
}

export const PERSIST_MAX_AGE_MS = MAX_AGE_MS;
