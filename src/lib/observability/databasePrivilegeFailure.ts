type DatabasePrivilegeTarget = "table" | "column" | "function";

/** Un 42501 genérico también puede ser RLS: exigir evidencia del privilegio concreto. */
export function databasePrivilegeTarget(error: unknown): DatabasePrivilegeTarget | undefined {
  if (!error || typeof error !== "object") return;
  const fields = Object.getOwnPropertyDescriptors(error);
  if (fields.code?.value !== "42501") return;
  for (const field of ["message", "details", "hint"]) {
    const value: unknown = fields[field]?.value;
    if (typeof value !== "string") continue;
    const target = /\bpermission denied for (table|column|function)\b/i.exec(value)?.[1]?.toLowerCase();
    if (target === "table" || target === "column" || target === "function") return target;
  }
}

/** No enviar SQL, nombres de objetos ni payloads arbitrarios del proveedor al SDK. */
export function databasePrivilegeIncident(target: DatabasePrivilegeTarget): Error {
  const incident = new Error(`Database privilege denied for ${target}`);
  incident.name = "DatabasePrivilegeError";
  return incident;
}
