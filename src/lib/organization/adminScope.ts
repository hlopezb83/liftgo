/**
 * Multi-organización · Fase 8 (tramo 5): alcance de la administración interna.
 *
 * Reglas:
 *  - La empresa del administrador sale SIEMPRE de `organization_memberships`
 *    (contexto verificado en servidor), nunca de un `organization_id` enviado
 *    por el navegador.
 *  - Sólo el personal con membresía `internal` alcanza la administración: una
 *    cuenta de portal queda fuera aunque tuviera un rol residual.
 *  - Un objetivo de otra empresa es indistinguible de uno inexistente
 *    (`not_found`), para no revelar nombres, correos ni roles ajenos.
 *  - El error de lectura (`read_error`) es un estado distinto de la ausencia
 *    de datos: nunca se degrada a "no encontrado".
 */
import {
  OrganizationContextError,
  resolveOrganizationContext,
  type OrganizationContextClient,
} from "./resolveOrganizationContext";

export type AdminScopeClient = OrganizationContextClient;

export type InternalAdminScope =
  | { status: "ready"; organizationId: string }
  | { status: "not_internal"; reason: "portal_account" | "no_membership" }
  | { status: "read_error" };

/** Empresa verificada del administrador interno que hace la petición. */
export async function resolveInternalScope(
  client: AdminScopeClient,
  userId: string,
): Promise<InternalAdminScope> {
  let context;
  try {
    context = await resolveOrganizationContext(client, userId);
  } catch (error) {
    if (error instanceof OrganizationContextError) return { status: "read_error" };
    throw error;
  }

  if (context.status !== "ready") {
    return { status: "not_internal", reason: "no_membership" };
  }
  if (context.memberType !== "internal") {
    return { status: "not_internal", reason: "portal_account" };
  }
  return { status: "ready", organizationId: context.organizationId };
}

export type TargetScope =
  | { status: "in_organization" }
  | { status: "not_found" }
  | { status: "read_error" };

/**
 * ¿El usuario objetivo pertenece a la empresa indicada?
 *
 * Se piden dos filas a propósito: más de una membresía es ambigüedad, no
 * éxito. Columnas mínimas (`organization_id`): no se leen nombres ni correos.
 */
export async function resolveTargetScope(
  client: AdminScopeClient,
  targetUserId: string,
  organizationId: string,
): Promise<TargetScope> {
  const result = await client
    .from("organization_memberships")
    .select("organization_id")
    .eq("auth_user_id", targetUserId)
    .limit(2);

  if (result.error) return { status: "read_error" };

  const rows = (result.data ?? []) as Record<string, unknown>[];
  if (rows.length !== 1) return { status: "not_found" };

  const org = rows[0]?.["organization_id"];
  if (typeof org !== "string" || org !== organizationId) return { status: "not_found" };

  return { status: "in_organization" };
}
