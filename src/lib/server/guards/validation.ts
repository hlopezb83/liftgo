/**
 * Validadores de entrada de los server functions administrativos.
 *
 * Portados 1:1 desde `supabase/functions/_shared/validate.ts`: mismas reglas,
 * mismos límites. Son funciones puras, sin acceso a base ni a Storage.
 */
import type { AppRole } from "./httpError";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL_RE =
  /^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

export function isUUID(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function isEmail(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (v.length < 6 || v.length > 254) return false;
  const [local] = v.split("@");
  if (
    !local || local.startsWith(".") || local.endsWith(".") ||
    local.includes("..")
  ) return false;
  return EMAIL_RE.test(v);
}

export function isNonEmptyString(v: unknown, maxLen = 500): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= maxLen;
}

const VALID_ROLES = [
  "admin",
  "administrativo",
  "dispatcher",
  "mechanic",
  "auditor",
  "ventas",
] as const;

export function isValidRole(v: unknown): v is AppRole {
  return typeof v === "string" &&
    (VALID_ROLES as readonly string[]).includes(v);
}
