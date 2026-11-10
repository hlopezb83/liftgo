const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Email regex endurecido (crítico para CFDI 4.0):
// - local-part: caracteres permitidos por RFC 5321 simplificado
// - dominio: labels alfanuméricos con guiones interiores
// - TLD: ≥ 2 caracteres alfabéticos
const EMAIL_RE =
  /^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

export function isUUID(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function isEmail(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (v.length < 6 || v.length > 254) return false;
  // Sin puntos consecutivos ni puntos al inicio/fin del local-part
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

export function isValidRole(v: unknown): v is string {
  const valid = [
    "admin",
    "administrativo",
    "dispatcher",
    "mechanic",
    "auditor",
    "ventas",
  ];
  return typeof v === "string" && valid.includes(v);
}
