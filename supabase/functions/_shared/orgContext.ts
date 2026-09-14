// Multiempresa · Fase 1 (aislamiento fiscal).
//
// Resolución de organización confiable en SERVIDOR. Reglas:
//  - La organización de una persona SIEMPRE se deriva de
//    `organization_memberships` (member_type = 'internal'), nunca del payload
//    del navegador.
//  - Un JWT service_role NO hereda organización: opera con la organización del
//    documento que procesa (y nunca con la de otro).
//  - Fail-closed: si no podemos resolverla, se rechaza antes de tocar el
//    documento, hacer claims, leer secretos o llamar al PAC.
//
// Este módulo NO reemplaza las RLS ni los triggers existentes
// (`enforce_organization_write_context`, policies RESTRICTIVE `org_scope_isolation`);
// es la capa equivalente para el código que corre con service_role.

export interface OrgQueryClient {
  // deno-lint-ignore no-explicit-any
  from: (table: string) => any;
}

export interface OrgContextOk {
  ok: true;
  /** Organización efectiva para la operación. */
  organizationId: string;
  /** null cuando el caller es service_role (cron / cola de reintentos). */
  callerOrganizationId: string | null;
}

export interface OrgContextFail {
  ok: false;
  status: number;
  message: string;
}

export type OrgContextResult = OrgContextOk | OrgContextFail;

export const ORG_MISSING_MEMBERSHIP =
  "Tu cuenta no está asociada a ninguna empresa. Contacta al administrador.";
export const ORG_DOCUMENT_MISMATCH =
  "El documento pertenece a otra empresa.";
export const ORG_DOCUMENT_WITHOUT_ORG =
  "El documento no tiene empresa asignada; no se puede operar sobre él.";
export const ORG_LOOKUP_UNAVAILABLE =
  "No se pudo verificar la empresa de tu cuenta. Reintenta en unos segundos.";

/**
 * Organización del usuario autenticado según `organization_memberships`.
 * Un usuario interno pertenece a UNA sola organización (invariante del modelo).
 */
export async function resolveCallerOrganization(
  admin: OrgQueryClient,
  userId: string,
): Promise<OrgContextResult> {
  if (!userId) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  const res = await admin
    .from("organization_memberships")
    .select("organization_id, member_type")
    .eq("auth_user_id", userId)
    .eq("member_type", "internal")
    .limit(2);

  const error = (res as { error?: unknown })?.error;
  if (error) {
    // Fail-closed: sin verificación no se opera.
    return { ok: false, status: 503, message: ORG_LOOKUP_UNAVAILABLE };
  }
  const rows = ((res as { data?: unknown })?.data ?? []) as Array<
    { organization_id?: string | null }
  >;
  if (rows.length === 0) {
    return { ok: false, status: 403, message: ORG_MISSING_MEMBERSHIP };
  }
  if (rows.length > 1) {
    // El modelo prohíbe multi-membresía interna; si aparece, es corrupción.
    return { ok: false, status: 409, message: ORG_MISSING_MEMBERSHIP };
  }
  const organizationId = rows[0]?.organization_id ?? null;
  if (!organizationId) {
    return { ok: false, status: 403, message: ORG_MISSING_MEMBERSHIP };
  }
  return { ok: true, organizationId, callerOrganizationId: organizationId };
}

export interface DocumentOrgInput {
  /** null ⇒ caller service_role (cron/retry). */
  callerOrganizationId: string | null;
  /** organization_id leído del registro en BD (nunca del payload). */
  documentOrganizationId: string | null | undefined;
}

/**
 * Verifica que el documento pertenece a la organización del caller.
 * Con caller service_role la organización efectiva es la del documento.
 */
export function assertDocumentOrganization(
  input: DocumentOrgInput,
): OrgContextResult {
  const docOrg = input.documentOrganizationId ?? null;
  if (!docOrg) {
    return { ok: false, status: 409, message: ORG_DOCUMENT_WITHOUT_ORG };
  }
  const callerOrg = input.callerOrganizationId;
  if (callerOrg === null) {
    // service_role: hereda la organización del registro procesado.
    return { ok: true, organizationId: docOrg, callerOrganizationId: null };
  }
  if (callerOrg !== docOrg) {
    return { ok: false, status: 403, message: ORG_DOCUMENT_MISMATCH };
  }
  return { ok: true, organizationId: docOrg, callerOrganizationId: callerOrg };
}

/**
 * Atajo para handlers autenticados: resuelve la organización del caller
 * (o null si es service_role) y la contrasta con la del documento.
 */
export async function resolveDocumentOrganization(input: {
  admin: OrgQueryClient;
  userId: string;
  isServiceRole: boolean;
  documentOrganizationId: string | null | undefined;
}): Promise<OrgContextResult> {
  let callerOrganizationId: string | null = null;
  if (!input.isServiceRole) {
    const caller = await resolveCallerOrganization(input.admin, input.userId);
    if (!caller.ok) return caller;
    callerOrganizationId = caller.organizationId;
  }
  return assertDocumentOrganization({
    callerOrganizationId,
    documentOrganizationId: input.documentOrganizationId,
  });
}

/**
 * Agrupa filas heterogéneas por `organization_id`, descartando (y reportando)
 * las que no la tengan. Base para que los crons procesen empresa por empresa.
 */
export function groupByOrganization<T extends { organization_id?: unknown }>(
  rows: readonly T[],
): { groups: Map<string, T[]>; withoutOrganization: T[] } {
  const groups = new Map<string, T[]>();
  const withoutOrganization: T[] = [];
  for (const row of rows) {
    const org = typeof row.organization_id === "string"
      ? row.organization_id
      : null;
    if (!org) {
      withoutOrganization.push(row);
      continue;
    }
    const bucket = groups.get(org);
    if (bucket) bucket.push(row);
    else groups.set(org, [row]);
  }
  return { groups, withoutOrganization };
}
