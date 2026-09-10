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
 * N-30: enlaza rol y perfil del invitado; ante cualquier fallo compensa
 * borrando el usuario auth recién creado.
 */
export async function finalizeInvitedUser(
  g: Guards,
  admin: AdminClient,
  userId: string,
  data: ValidatedInvite,
): Promise<void> {
  const cleanupInvitedUser = async () => {
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) console.error("invite-user cleanup deleteUser failed:", delErr);
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("user_id", userId);
  };

  // DB2-01: upsert sobre (user_id), el índice único vigente.
  const { error: roleErr } = await admin
    .from("user_roles")
    .upsert({ user_id: userId, role: data.role }, { onConflict: "user_id" });
  if (roleErr) {
    console.error("[invite-user] assignRoleToUser:", roleErr.message);
    await cleanupInvitedUser();
    throw new g.HttpError(500, "No se pudo completar la invitación");
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ full_name: data.full_name, email: data.email })
    .eq("user_id", userId);
  if (profileErr) {
    console.error("[invite-user] profiles update:", profileErr);
    await cleanupInvitedUser();
    throw new g.HttpError(500, "No se pudo completar la invitación");
  }
}

/**
 * Valida que el objetivo del restablecimiento sea otro usuario no administrador.
 */
export async function assertResettableTarget(
  g: Guards,
  admin: AdminClient,
  userId: string,
  callerId: string,
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

