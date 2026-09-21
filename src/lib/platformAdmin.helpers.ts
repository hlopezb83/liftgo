/**
 * Auxiliares de la operación de plataforma: traducción de errores de las RPC
 * `platform_*`, validación de entrada, compensación del alta y creación del
 * usuario Auth del primer administrador.
 *
 * Sin cambios de comportamiento respecto de `platformAdmin.functions.ts`: los
 * guards privilegiados siguen llegando por parámetro (`g`, `admin`), así que
 * este módulo no importa nada server-only de forma estática.
 */
import type { CreateOrganizationInput } from "./platformAdmin.types";

type Guards = typeof import("./server/adminGuards.server");
type Admin = Awaited<ReturnType<Guards["requireRole"]>>["admin"];

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

/** Traduce el error SQL de las funciones `platform_*` a un HttpError estable. */
export function rpcError(
  g: Guards,
  context: string,
  error: { message: string; code?: string },
): never {
  const msg = error.message ?? "";
  console.error(`[platform-admin] ${context}:`, error.code ?? "", msg);
  if (error.code === "42501" || /Forbidden|operador de plataforma/i.test(msg)) {
    throw new g.HttpError(
      403,
      "Forbidden: se requiere un operador de plataforma",
    );
  }
  if (
    error.code === "23505" ||
    /Ya existe|ya tiene administradores|ya pertenece/i.test(msg)
  ) {
    throw new g.HttpError(409, msg || "Conflicto con un registro existente");
  }
  if (error.code === "22023") {
    throw new g.HttpError(400, msg || "Datos inválidos");
  }
  if (error.code === "P0002" || /no encontrad/i.test(msg)) {
    throw new g.HttpError(404, msg || "Registro no encontrado");
  }
  throw new g.HttpError(500, "No se pudo completar la operación de plataforma");
}

export function validateCreateInput(g: Guards, data: CreateOrganizationInput) {
  if (!g.isNonEmptyString(data.name, 120) || data.name.trim().length < 2) {
    throw new g.HttpError(
      400,
      "El nombre de la empresa debe tener entre 2 y 120 caracteres",
    );
  }
  if (
    typeof data.slug !== "string" ||
    !SLUG_RE.test(data.slug.trim().toLowerCase())
  ) {
    throw new g.HttpError(
      400,
      "El identificador (slug) sólo admite minúsculas, dígitos y guiones (2 a 63 caracteres)",
    );
  }
  if (!g.isEmail(data.admin_email)) {
    throw new g.HttpError(400, "El correo del administrador no es válido");
  }
  if (!g.isNonEmptyString(data.admin_full_name, 200)) {
    throw new g.HttpError(400, "El nombre del administrador es obligatorio");
  }
  if (
    data.admin_password !== undefined &&
    data.admin_password !== "" &&
    !isStrongAdminPassword(data.admin_password)
  ) {
    throw new g.HttpError(
      400,
      "La contraseña debe tener 12-72 caracteres e incluir mayúsculas, minúsculas, números y símbolos",
    );
  }
}


/**
 * Compensación del alta. Orden: primero el usuario Auth (cascada sobre perfil,
 * rol y membresía), después la empresa (sólo se borra si quedó sin miembros;
 * si algo ya la referencia queda suspendida, nunca activa y vacía).
 */
export async function compensateOnboarding(
  g: Guards,
  admin: Admin,
  actorId: string,
  organizationId: string,
  userId: string | null,
) {
  if (userId) {
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr)
      console.error(
        "[platform-admin] compensación deleteUser:",
        delErr.message,
      );
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("user_id", userId);
    await admin
      .from("organization_memberships")
      .delete()
      .eq("auth_user_id", userId);
  }
  const { error } = await g
    .asUntypedRpc(admin)
    .rpc("platform_discard_organization", {
      p_actor: actorId,
      p_organization_id: organizationId,
    });
  if (error)
    console.error("[platform-admin] compensación discard:", error.message);
}

/** Unicidad de correo antes de crear nada (mismo criterio que invite-user). */
export async function assertEmailAvailable(
  g: Guards,
  admin: Admin,
  emailLc: string,
): Promise<void> {
  const { data: existingProfile, error: profileErr } = await admin
    .from("profiles")
    .select("user_id")
    .eq("email", emailLc)
    .maybeSingle();
  if (profileErr) {
    throw new g.HttpError(
      503,
      "No se pudo verificar el correo. Reintenta en unos segundos.",
    );
  }
  if (existingProfile) {
    throw new g.HttpError(409, "Ya existe un usuario con ese correo");
  }
}

/**
 * Usuario Auth del primer administrador (metadata = contexto de auditoría).
 * Si falla, la empresa recién creada se descarta antes de propagar el error.
 */
export async function createFirstAdminAuthUser(
  g: Guards,
  admin: Admin,
  actorId: string,
  organizationId: string,
  email: string,
  fullName: string,
  password?: string,
): Promise<string> {
  const { data: newUser, error: createErr } = await admin.auth.admin.createUser(
    {
      email,
      password: password || g.generateSecurePassword(),

      email_confirm: true,
      // Tramo 12 (0033): contexto de empresa por `app_metadata` (server-only).
      user_metadata: { full_name: fullName },
      app_metadata: { organization_id: organizationId },
    },
  );
  if (createErr || !newUser?.user) {
    await compensateOnboarding(g, admin, actorId, organizationId, null);
    const msg = createErr?.message || "";
    console.error("[platform-admin] createUser:", createErr);
    if (/already|registered|exists/i.test(msg)) {
      throw new g.HttpError(409, "Ya existe un usuario con ese correo");
    }
    // El servicio de autenticación rechaza contraseñas filtradas o comunes.
    if (/weak|easy to guess|pwned|password/i.test(msg)) {
      throw new g.HttpError(
        400,
        "La contraseña es muy común o fácil de adivinar. Elige una contraseña más segura.",
      );
    }
    throw new g.HttpError(400, "No se pudo procesar la solicitud");
  }
  return newUser.user.id;
}
