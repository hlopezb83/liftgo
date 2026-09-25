/**
 * Contratos del módulo Auditoría: query keys, tipos y normalizadores.
 *
 * `auditKeys` provee el namespace raíz para invalidaciones amplias
 * (usado por las mutaciones de `useAuditLogs`).
 */
import { ROLE_LABELS } from "@/lib/constants";
import type { AppRole } from "@/lib/domain/roles";
import { createEntityKeys } from "@/lib/query/createEntityKeys";

export const auditKeys = createEntityKeys("audit");

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  /** Solo presente cuando se descarga el detalle por id. */
  old_data?: Record<string, unknown> | null;
  /** Solo presente cuando se descarga el detalle por id. */
  new_data?: Record<string, unknown> | null;
  changed_fields: string[] | null;
  user_id: string | null;
  created_at: string;
  /** v7.364.0: origen del movimiento — usuario, sistema (procesos) o prueba E2E. */
  source?: AuditSource;
  is_e2e?: boolean;
  // joined
  user_email?: string;
  /** Etiqueta pre-computada para la lista (P1-4b). */
  label?: string;
}

export type AuditSource = "user" | "system" | "e2e";

/**
 * v7.364.0: filtro de origen de la bitácora.
 * - `default`: oculta los registros de pruebas automatizadas (comportamiento normal).
 * - `user` / `system` / `e2e`: sólo ese origen.
 * - `all`: no filtra nada.
 */
export type AuditOrigin = "default" | "user" | "system" | "e2e" | "all";

export interface AuditLogFilters {
  table_name?: string;
  record_id?: string;
  origin?: AuditOrigin;
  [key: string]: unknown;
}


function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

const AUDIT_ORIGINS: readonly AuditOrigin[] = ["default", "user", "system", "e2e", "all"];

export function readAuditLogFilters(filter: Readonly<Record<string, unknown>> | undefined): AuditLogFilters {
  const filters: AuditLogFilters = {};
  if (isRecord(filter)) {
    if (typeof filter.table_name === "string") filters.table_name = filter.table_name;
    if (typeof filter.record_id === "string") filters.record_id = filter.record_id;
    if (typeof filter.origin === "string" && (AUDIT_ORIGINS as readonly string[]).includes(filter.origin)) {
      filters.origin = filter.origin as AuditOrigin;
    }
  }
  filters.origin ??= "default";
  return filters;
}


export function normalizeJson(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

// P1-4b: proyecciones ligeras para armar el label sin traer old_data/new_data.
// PostgREST devuelve `null` si el campo no existe en el jsonb, así que basta
// escoger el primero definido entre new_* y luego old_*.
export type LabelProjectionRow = {
  table_name: string;
  new_name: string | null; new_booking: string | null; new_contract: string | null;
  new_invoice: string | null; new_quote: string | null; new_delivery: string | null; new_desc: string | null;
  old_name: string | null; old_booking: string | null; old_contract: string | null;
  old_invoice: string | null; old_quote: string | null; old_delivery: string | null; old_desc: string | null;
  new_full: string | null; old_full: string | null;
  new_email: string | null; old_email: string | null;
  new_role: string | null; old_role: string | null;
};

/**
 * R9-P2: `user_roles` y `profiles` no tienen columnas name/number, así que la
 * bitácora caía al fallback hexadecimal (`record_id.slice(0,8)`). Ahora se
 * etiquetan con el rol o el nombre/correo de la persona.
 */
function buildIdentityLabel(row: LabelProjectionRow): string | null {
  if (row.table_name === "user_roles") {
    const role = row.new_role ?? row.old_role;
    if (!role) return null;
    return `Rol: ${ROLE_LABELS[role as AppRole] ?? role}`;
  }
  if (row.table_name === "profiles") {
    return row.new_full ?? row.old_full ?? row.new_email ?? row.old_email;
  }
  return null;
}

export function buildLabel(row: LabelProjectionRow, recordId: string): string {
  const first = [
    buildIdentityLabel(row),
    row.new_name, row.new_booking, row.new_contract, row.new_invoice, row.new_quote, row.new_delivery,
    row.old_name, row.old_booking, row.old_contract, row.old_invoice, row.old_quote, row.old_delivery,
    row.new_desc, row.old_desc,
  ].find((value) => value != null);
  if (!first) return recordId.slice(0, 8);
  return first.length > 30 ? first.slice(0, 30) : first;
}
