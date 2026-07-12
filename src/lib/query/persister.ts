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

/** Prefijos de queryKey que se persisten en disco. */
const PERSIST_ALLOWLIST: readonly string[] = [
  "dashboard",
  "financial-kpis",
  "mrr",
  "changelog",
  "equipment_models",
  "drivers",
  "mechanics",
  "suppliers",
  "customers",
  "forklifts",
  "inventory",
  "contract-templates",
  "cash-flow-settings",
];

/** Prefijos EXPLÍCITAMENTE bloqueados (defensa en profundidad). */
const PERSIST_BLOCKLIST: readonly string[] = [
  "user_roles",
  "role_permissions",
  "billing-secrets",
  "pac-config",
  "auth",
  "session",
  "user",
  "portal",
];

export function shouldPersistQuery(query: Query): boolean {
  const root = query.queryKey[0];
  if (typeof root !== "string") return false;
  if (PERSIST_BLOCKLIST.includes(root)) return false;
  return PERSIST_ALLOWLIST.includes(root);
}

export function createBrowserPersister() {
  if (typeof window === "undefined") return undefined;
  return createSyncStoragePersister({
    storage: window.localStorage,
    key: STORAGE_KEY,
    throttleTime: 1000,
  });
}

export const PERSIST_MAX_AGE_MS = MAX_AGE_MS;
