/**
 * Multi-organización · tramo 4 (prospectos y operaciones).
 *
 * La empresa de una fila NO es un dato editable del formulario: la resuelve el
 * trigger `enforce_organization_write_context` a partir de la membresía
 * verificada del usuario. Este módulo evita que un payload construido en el
 * navegador (o un objeto reutilizado de una lectura previa) arrastre un
 * `organization_id` hacia un INSERT/UPDATE.
 *
 * Contrato vigente del trigger, que aquí NO se duplica ni se relaja:
 * - Usuario con membresía: si envía otra empresa → error 42501; si no envía
 *   nada, se rellena con su propia empresa.
 * - UPDATE que intenta cambiar `organization_id` → error 23514.
 *
 * Quitar la columna en el cliente sólo elimina la ambigüedad y los rechazos
 * evitables; la defensa real sigue siendo el trigger y las policies
 * `org_scope_isolation`.
 */

/** Tipo de payload sin la columna de empresa. */
export type WithoutOrganization<T> = Omit<T, "organization_id">;

/**
 * Devuelve una copia del payload sin `organization_id`.
 * No muta el objeto original y conserva el resto de las claves tal cual.
 */
export function stripOrganizationId<T extends object>(payload: T): WithoutOrganization<T> {
  if (!payload || typeof payload !== "object") return payload as WithoutOrganization<T>;
  if (!("organization_id" in payload)) return payload as WithoutOrganization<T>;
  const copy = { ...(payload as Record<string, unknown>) };
  delete copy["organization_id"];
  return copy as WithoutOrganization<T>;
}
