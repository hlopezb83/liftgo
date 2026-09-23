/**
 * Guardas y pasos auxiliares de la administración de usuarios internos.
 * Sin cambios de reglas: mismas validaciones y mensajes que antes.
 */
import type { InviteUserInput } from "./userAdmin.functions";

type Guards = typeof import("./server/adminGuards.server");
type AdminClient = Awaited<ReturnType<Guards["requireAdmin"]>>["admin"];
type AppRole = Parameters<Guards["requireRole"]>[2][number];
type ValidatedInvite = InviteUserInput & { role: AppRole };

/** SEC-B5: contraseña manual fuerte (12-72 caracteres, 4 clases). */
function isStrongPassword(password: unknown): boolean {
  return typeof password === "string" &&
    password.length >= 12 && password.length <= 72 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) &&
    /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
}

export function validateInviteInput(
  g: Guards,
  data: InviteUserInput,
): asserts data is ValidatedInvite {
  const { email, full_name, role, password } = data;
  if (!g.isEmail(email)) {
    throw new g.HttpError(400, "A valid email is required (max 255 chars)");
  }
  if (!g.isNonEmptyString(full_name, 200)) {
    throw new g.HttpError(400, "full_name is required (max 200 chars)");
  }
  if (!g.isValidRole(role)) {
    throw new g.HttpError(400, "Invalid role");
  }
  if (password !== undefined && !isStrongPassword(password)) {
    throw new g.HttpError(
      400,
      "La contraseña debe tener 12-72 caracteres e incluir mayúsculas, minúsculas, números y símbolos",
    );
  }
}

/**
 * N-30 / 0057: membresía + rol + perfil en UNA transacción mediante la RPC
 * server-only `provision_invited_internal_user`, que fija el contexto de
 * empresa (audit_logs lo exige con varias empresas activas). Ante fallo,
 * compensa primero las filas públicas con contexto y luego borra la cuenta.
 */
export async function finalizeInvitedUser(
  g: Guards,
  admin: AdminClient,
  userId: string,
  data: ValidatedInvite,
  organizationId: string,
  callerId: string,
): Promise<void> {
  const { error: provisionErr } = await admin.rpc("provision_invited_internal_user", {
    p_caller_id: callerId,
    p_user_id: userId,
    p_organization_id: organizationId,
    p_role: data.role,
    p_full_name: data.full_name,
    p_email: data.email,
  });
  if (!provisionErr) return;

  console.error("[invite-user] provision:", provisionErr.message);
  const { error: discardErr } = await admin.rpc("discard_invited_internal_user", {
    p_user_id: userId,
    p_organization_id: organizationId,
  });
  if (discardErr) console.error("[invite-user] cleanup discard:", discardErr.message);
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) console.error("[invite-user] cleanup deleteUser:", delErr.message);
  throw new g.HttpError(500, "No se pudo completar la invitación");
}

/**
 * Valida que el objetivo del restablecimiento sea otro usuario no administrador.
 */
export async function assertResettableTarget(
  g: Guards,
  admin: AdminClient,
  userId: string,
  callerId: string,
  organizationId: string,
): Promise<void> {
  if (!g.isUUID(userId)) {
    throw new g.HttpError(400, "user_id must be a valid UUID");
  }
  if (userId === callerId) {
    throw new g.HttpError(
      400,
      "Para tu propia cuenta usa 'Olvidé mi contraseña' en el login",
    );
  }
  // Tramo 5: autorizar pertenencia antes de leer roles del objetivo.
  await g.assertTargetInOrganization(admin, userId, organizationId);
  // Guarda anti-takeover: prohibido restablecer la contraseña de un admin.
  const { data: targetAdmin } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (targetAdmin) {
    throw new g.HttpError(
      403,
      "No puedes restablecer la contraseña de un administrador",
    );
  }
}


/**
 * El invariante "queda al menos un administrador activo" se evalúa POR empresa:
 * los admins de otras organizaciones no cubren a la empresa del objetivo.
 */
export async function assertNotLastActiveAdmin(
  g: Guards,
  admin: AdminClient,
  userId: string,
  organizationId: string,
): Promise<void> {
  const { data: targetAdmin } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (!targetAdmin) return;

  const { data: orgMembers } = await admin
    .from("organization_memberships")
    .select("auth_user_id")
    .eq("organization_id", organizationId);
  const memberIds = (orgMembers ?? []).map((m) => m.auth_user_id);

  const { data: otherAdmins } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .neq("user_id", userId)
    .in("user_id", memberIds.length > 0 ? memberIds : [userId]);

  const otherIds = (otherAdmins ?? []).map((a) => a.user_id);
  let activeOthers = 0;
  if (otherIds.length > 0) {
    const { count } = await admin
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .in("user_id", otherIds)
      .eq("is_active", true);
    activeOthers = count ?? 0;
  }

  if (activeOthers === 0) {
    throw new g.HttpError(
      400,
      "LAST_ADMIN_CANNOT_BE_DEACTIVATED: no puedes desactivar al último administrador activo.",
    );
  }
}
