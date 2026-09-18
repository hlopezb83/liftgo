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
import {
  assertEmailAvailable,
  compensateOnboarding,
  createFirstAdminAuthUser,
  rpcError,
  validateCreateInput,
} from "./platformAdmin.helpers";
import type {
  CreateOrganizationInput,
  CreateOrganizationResult,
  PlatformOperatorStatus,
  PlatformOrganizationRow,
  SetOrganizationActiveInput,
} from "./platformAdmin.types";

export type {
  CreateOrganizationInput,
  CreateOrganizationResult,
  PlatformOperatorStatus,
  PlatformOrganizationRow,
  SetOrganizationActiveInput,
};

/** ¿El usuario autenticado es operador de plataforma? (para mostrar la sección). */
export const getPlatformOperatorStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformOperatorStatus> => {
    const g = await import("./server/adminGuards.server");
    const { data, error } = await g
      .asUntypedRpc(context.supabase)
      .rpc("is_platform_operator");
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
    const { admin, userId } = await g.requirePlatformOperator(
      context.supabase,
      context.userId,
    );

    const { data, error } = await g
      .asUntypedRpc(admin)
      .rpc("platform_list_organizations", {
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

export const createOrganizationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateOrganizationInput) => data)
  .handler(async ({ data, context }): Promise<CreateOrganizationResult> => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId: actorId } = await g.requirePlatformOperator(
      context.supabase,
      context.userId,
    );
    await g.enforceRateLimit(
      admin,
      "platform-create-organization",
      actorId,
      5,
      300,
    );
    validateCreateInput(g, data);

    const name = data.name.trim();
    const slug = data.slug.trim().toLowerCase();
    const email = data.admin_email.trim();
    const emailLc = email.toLowerCase();
    const fullName = data.admin_full_name.trim();

    await assertEmailAvailable(g, admin, emailLc);

    // 1) Empresa (la base valida nombre/slug y unicidad).
    const created = await g
      .asUntypedRpc(admin)
      .rpc("platform_create_organization", {
        p_actor: actorId,
        p_name: name,
        p_slug: slug,
      });
    if (created.error)
      rpcError(g, "platform_create_organization", created.error);
    const organizationId = String(created.data);
    if (!g.isUUID(organizationId)) {
      throw new g.HttpError(
        500,
        "No se pudo completar la operación de plataforma",
      );
    }

    // 2) Usuario Auth del primer administrador (compensa la empresa si falla).
    const adminUserId = await createFirstAdminAuthUser(
      g,
      admin,
      actorId,
      organizationId,
      email,
      fullName,
    );

    // 3) Membresía interna + rol admin + perfil activo, atómico en la base.
    const attached = await g
      .asUntypedRpc(admin)
      .rpc("platform_attach_first_admin", {
        p_actor: actorId,
        p_organization_id: organizationId,
        p_user_id: adminUserId,
      });
    if (attached.error) {
      await compensateOnboarding(
        g,
        admin,
        actorId,
        organizationId,
        adminUserId,
      );
      rpcError(g, "platform_attach_first_admin", attached.error);
    }

    const { error: profileUpdErr } = await admin
      .from("profiles")
      .update({ full_name: fullName, email: emailLc })
      .eq("user_id", adminUserId);
    if (profileUpdErr)
      console.error("[platform-admin] profiles update:", profileUpdErr.message);

    const { data: linkData, error: linkErr } =
      await admin.auth.admin.generateLink({
        type: "recovery",
        email,
      });
    if (linkErr)
      console.error("[platform-admin] generateLink:", linkErr.message);

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
    const {
      admin,
      userId: actorId,
      organizationId: ownOrganizationId,
    } = await g.requirePlatformOperator(context.supabase, context.userId);
    await g.enforceRateLimit(
      admin,
      "platform-set-organization-active",
      actorId,
      10,
      60,
    );

    if (!g.isUUID(data.organization_id)) {
      throw new g.HttpError(400, "organization_id must be a valid UUID");
    }
    if (typeof data.active !== "boolean") {
      throw new g.HttpError(400, "Se requiere el estado deseado");
    }
    // La base también lo impide; aquí se responde antes y con mensaje claro.
    if (!data.active && data.organization_id === ownOrganizationId) {
      throw new g.HttpError(
        400,
        "No puedes suspender la empresa a la que perteneces",
      );
    }

    const { error } = await g
      .asUntypedRpc(admin)
      .rpc("platform_set_organization_active", {
        p_actor: actorId,
        p_organization_id: data.organization_id,
        p_active: data.active,
      });
    if (error) rpcError(g, "platform_set_organization_active", error);
    return { success: true };
  });
