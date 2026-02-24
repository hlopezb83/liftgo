const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isUUID(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function isEmail(v: unknown): v is string {
  return typeof v === "string" && EMAIL_RE.test(v) && v.length <= 255;
}

export function isNonEmptyString(v: unknown, maxLen = 500): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= maxLen;
}

export function isValidRole(v: unknown): v is string {
  const valid = ["admin", "administrativo", "dispatcher", "mechanic", "auditor"];
  return typeof v === "string" && valid.includes(v);
}
