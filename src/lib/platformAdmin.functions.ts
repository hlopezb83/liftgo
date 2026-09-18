/**
 * Operación de plataforma (tramo 9 multiempresa): alta y suspensión de
 * empresas y alta de su primer administrador.
 *
 * Reglas:
 *  · Sólo un operador de plataforma activo (`platform_operators`) puede
 *    invocar estas funciones. El guard se evalúa con el cliente del usuario y
 *    la base vuelve a verificarlo en cada RPC (`assert_platform_operator`).
 *  · Las RPC `platform_*` sólo son ejecutables por `service_role`; el
 *    navegador nunca las llama directamente ni envía `organization_id`
 *    como verdad: aquí sólo identifica QUÉ empresa operar, y la base decide.
 *  · El alta es compensable: si falla el usuario o el primer administrador, la
 *    empresa recién creada se descarta (`platform_discard_organization`) y el
 *    usuario Auth se elimina. Nunca queda una empresa sin administrador.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Guards = typeof import("./server/adminGuards.server");
type Admin = Awaited<ReturnType<Guards["requireRole"]>>["admin"];

export interface PlatformOrganizationRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  internal_members: number;
  portal_accounts: number;
  customers: number;
}

export interface PlatformOperatorStatus {
  isOperator: boolean;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  admin_email: string;
  admin_full_name: string;
}

export interface CreateOrganizationResult {
  success: true;
  organization_id: string;
  admin_user_id: string;
  admin_email: string;
  /** Enlace de un solo uso para que el primer administrador defina su contraseña. */
  recovery_link: string | null;
}

export interface SetOrganizationActiveInput {
  organization_id: string;
  active: boolean;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

/** Traduce el error SQL de las funciones `platform_*` a un HttpError estable. */
function rpcError(g: Guards, context: string, error: { message: string; code?: string }): never {
  const msg = error.message ?? "";
  console.error(`[platform-admin] ${context}:`, error.code ?? "", msg);
  if (error.code === "42501" || /Forbidden|operador de plataforma/i.test(msg)) {
    throw new g.HttpError(403, "Forbidden: se requiere un operador de plataforma");
  }
  if (error.code === "23505" || /Ya existe|ya tiene administradores|ya pertenece/i.test(msg)) {
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

/** ¿El usuario autenticado es operador de plataforma? (para mostrar la sección). */
export const getPlatformOperatorStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformOperatorStatus> => {
    const g = await import("./server/adminGuards.server");
    const { data, error } = await g.asUntypedRpc(context.supabase).rpc("is_platform_operator");
    if (error) {
      // Sin la función (migración 0030 no aplicada) o sin permiso: no operador.
      return { isOperator: false };
    }
    return { isOperator: data === true };
  });

export const listOrganizationsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformOrganizationRow[]> => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId } = await g.requirePlatformOperator(context.supabase, context.userId);

    const { data, error } = await g.asUntypedRpc(admin).rpc("platform_list_organizations", {
      p_actor: userId,
    });
    if (error) rpcError(g, "platform_list_organizations", error);

    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row["id"]),
      name: String(row["name"] ?? ""),
      slug: String(row["slug"] ?? ""),
      is_active: row["is_active"] === true,
      created_at: String(row["created_at"] ?? ""),
      internal_members: Number(row["internal_members"] ?? 0),
      portal_accounts: Number(row["portal_accounts"] ?? 0),
      customers: Number(row["customers"] ?? 0),
    }));
  });

function validateCreateInput(g: Guards, data: CreateOrganizationInput) {
  if (!g.isNonEmptyString(data.name, 120) || data.name.trim().length < 2) {
    throw new g.HttpError(400, "El nombre de la empresa debe tener entre 2 y 120 caracteres");
  }
  if (typeof data.slug !== "string" || !SLUG_RE.test(data.slug.trim().toLowerCase())) {
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
}

/**
 * Compensación del alta. Orden: primero el usuario Auth (cascada sobre perfil,
 * rol y membresía), después la empresa (sólo se borra si quedó sin miembros;
 * si algo ya la referencia queda suspendida, nunca activa y vacía).
 */
async function compensateOnboarding(
  g: Guards,
  admin: Admin,
  actorId: string,
  organizationId: string,
  userId: string | null,
) {
  if (userId) {
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) console.error("[platform-admin] compensación deleteUser:", delErr.message);
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("user_id", userId);
    await admin.from("organization_memberships").delete().eq("auth_user_id", userId);
  }
  const { error } = await g.asUntypedRpc(admin).rpc("platform_discard_organization", {
    p_actor: actorId,
    p_organization_id: organizationId,
  });
  if (error) console.error("[platform-admin] compensación discard:", error.message);
}

export const createOrganizationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateOrganizationInput) => data)
  .handler(async ({ data, context }): Promise<CreateOrganizationResult> => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId: actorId } = await g.requirePlatformOperator(
      context.supabase,
      context.userId,
    );
    await g.enforceRateLimit(admin, "platform-create-organization", actorId, 5, 300);
    validateCreateInput(g, data);

    const name = data.name.trim();
    const slug = data.slug.trim().toLowerCase();
    const email = data.admin_email.trim();
    const emailLc = email.toLowerCase();
    const fullName = data.admin_full_name.trim();

    // Unicidad de correo antes de crear nada (mismo criterio que invite-user).
    const { data: existingProfile, error: profileErr } = await admin
      .from("profiles")
      .select("user_id")
      .eq("email", emailLc)
      .maybeSingle();
    if (profileErr) {
      throw new g.HttpError(503, "No se pudo verificar el correo. Reintenta en unos segundos.");
    }
    if (existingProfile) {
      throw new g.HttpError(409, "Ya existe un usuario con ese correo");
    }

    // 1) Empresa (la base valida nombre/slug y unicidad).
    const created = await g.asUntypedRpc(admin).rpc("platform_create_organization", {
      p_actor: actorId,
      p_name: name,
      p_slug: slug,
    });
    if (created.error) rpcError(g, "platform_create_organization", created.error);
    const organizationId = String(created.data);
    if (!g.isUUID(organizationId)) {
      throw new g.HttpError(500, "No se pudo completar la operación de plataforma");
    }

    // 2) Usuario Auth del primer administrador (metadata = contexto de auditoría).
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: g.generateSecurePassword(),
      email_confirm: true,
      user_metadata: { full_name: fullName, organization_id: organizationId },
    });
    if (createErr || !newUser?.user) {
      await compensateOnboarding(g, admin, actorId, organizationId, null);
      const msg = createErr?.message || "";
      const status = /already|registered|exists/i.test(msg) ? 409 : 400;
      console.error("[platform-admin] createUser:", createErr);
      throw new g.HttpError(
        status,
        status === 409 ? "Ya existe un usuario con ese correo" : "No se pudo procesar la solicitud",
      );
    }
    const adminUserId = newUser.user.id;

    // 3) Membresía interna + rol admin + perfil activo, atómico en la base.
    const attached = await g.asUntypedRpc(admin).rpc("platform_attach_first_admin", {
      p_actor: actorId,
      p_organization_id: organizationId,
      p_user_id: adminUserId,
    });
    if (attached.error) {
      await compensateOnboarding(g, admin, actorId, organizationId, adminUserId);
      rpcError(g, "platform_attach_first_admin", attached.error);
    }

    const { error: profileUpdErr } = await admin
      .from("profiles")
      .update({ full_name: fullName, email: emailLc })
      .eq("user_id", adminUserId);
    if (profileUpdErr) console.error("[platform-admin] profiles update:", profileUpdErr.message);

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (linkErr) console.error("[platform-admin] generateLink:", linkErr.message);

    return {
      success: true,
      organization_id: organizationId,
      admin_user_id: adminUserId,
      admin_email: email,
      recovery_link: linkData?.properties?.action_link ?? null,
    };
  });

export const setOrganizationActiveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SetOrganizationActiveInput) => data)
  .handler(async ({ data, context }): Promise<{ success: true }> => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId: actorId, organizationId: ownOrganizationId } =
      await g.requirePlatformOperator(context.supabase, context.userId);
    await g.enforceRateLimit(admin, "platform-set-organization-active", actorId, 10, 60);

    if (!g.isUUID(data.organization_id)) {
      throw new g.HttpError(400, "organization_id must be a valid UUID");
    }
    if (typeof data.active !== "boolean") {
      throw new g.HttpError(400, "Se requiere el estado deseado");
    }
    // La base también lo impide; aquí se responde antes y con mensaje claro.
    if (!data.active && data.organization_id === ownOrganizationId) {
      throw new g.HttpError(400, "No puedes suspender la empresa a la que perteneces");
    }

    const { error } = await g.asUntypedRpc(admin).rpc("platform_set_organization_active", {
      p_actor: actorId,
      p_organization_id: data.organization_id,
      p_active: data.active,
    });
    if (error) rpcError(g, "platform_set_organization_active", error);
    return { success: true };
  });
