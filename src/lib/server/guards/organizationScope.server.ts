/**
 * Alcance de organización (tramo 5 multiempresa, server-only).
 *
 * El `organization_id` NUNCA llega del navegador: se resuelve con el cliente
 * autenticado del propio usuario sobre `organization_memberships`.
 */
import {
  resolveInternalScope,
  resolveTargetScope,
} from "@/lib/organization/adminScope";
import { type AdminClient, type CallerClient, HttpError } from "./httpError";

/** Empresa verificada del administrador interno. */
export async function requireInternalOrganization(
  caller: CallerClient,
  userId: string,
): Promise<string> {
  const scope = await resolveInternalScope(
    caller as unknown as Parameters<typeof resolveInternalScope>[0],
    userId,
  );

  if (scope.status === "read_error") {
    throw new HttpError(
      503,
      "No se pudo verificar tu empresa. Reintenta en unos segundos.",
    );
  }
  if (scope.status === "not_internal") {
    throw new HttpError(403, "Forbidden: sin membresía interna verificada");
  }
  return scope.organizationId;
}

/**
 * El usuario objetivo debe pertenecer a la misma empresa. Un objetivo de otra
 * empresa responde igual que uno inexistente: no se filtra su existencia.
 */
export async function assertTargetInOrganization(
  admin: AdminClient,
  targetUserId: string,
  organizationId: string,
): Promise<void> {
  const target = await resolveTargetScope(
    admin as unknown as Parameters<typeof resolveTargetScope>[0],
    targetUserId,
    organizationId,
  );

  if (target.status === "read_error") {
    throw new HttpError(
      503,
      "No se pudo verificar la empresa del usuario. Reintenta en unos segundos.",
    );
  }
  if (target.status === "not_found") {
    throw new HttpError(404, "Usuario no encontrado en tu empresa");
  }
}

/** Alta de la membresía interna del invitado en la empresa del administrador. */
export async function createInternalMembership(
  admin: AdminClient,
  userId: string,
  organizationId: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await admin
    .from("organization_memberships")
    .insert({
      auth_user_id: userId,
      organization_id: organizationId,
      member_type: "internal",
    });
  return { error: error ? { message: error.message } : null };
}
