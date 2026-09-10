/**
 * Administración de usuarios internos (antes Edge Functions
 * invite-user / delete-user / reset-user-password / toggle-user-status).
 * Mismas reglas, mismos mensajes y mismos límites de intentos.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertResettableTarget,
  finalizeInvitedUser,
  validateInviteInput,
} from "./userAdmin.helpers";

export interface InviteUserInput {
  email: string;
  full_name: string;
  role: string;
  password?: string;
}

export interface InviteUserResult {
  success: boolean;
  user_id: string;
  email: string;
  recovery_link: string | null;
}

export const inviteUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: InviteUserInput) => data)
  .handler(async ({ data, context }): Promise<InviteUserResult> => {
    const g = await import("./server/adminGuards.server");
    const { admin } = await g.requireAdmin(context.supabase, context.userId);
    await g.enforceRateLimit(admin, "invite-user", context.userId);

    const { email, full_name, password } = data;
    validateInviteInput(g, data);

    // AUTH-001 / B-2: unicidad de email con comparación exacta en minúsculas.
    const emailLc = email.toLowerCase();
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("user_id")
      .eq("email", emailLc)
      .maybeSingle();
    if (existingProfile) {
      throw new g.HttpError(409, "Ya existe un usuario con ese correo");
    }

    const finalPassword = password || g.generateSecurePassword();
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createErr || !newUser?.user) {
      const msg = createErr?.message || "";
      const status = /already|registered|exists/i.test(msg) ? 409 : 400;
      console.error("[invite-user] createUser:", createErr);
      throw new g.HttpError(
        status,
        status === 409
          ? "Ya existe un usuario con ese correo"
          : "No se pudo procesar la solicitud",
      );
    }

    const userId = newUser.user.id;

    await finalizeInvitedUser(g, admin, userId, data);

    // SEC-B5: recovery link para que el invitado defina su contraseña.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (linkErr) console.error("[invite-user] generateLink:", linkErr.message);

    return {
      success: true,
      user_id: userId,
      email,
      recovery_link: linkData?.properties?.action_link ?? null,
    };
  });

export const deleteUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string }) => data)
  .handler(async ({ data, context }) => {
    const g = await import("./server/adminGuards.server");
    const { admin } = await g.requireAdmin(context.supabase, context.userId);
    await g.enforceRateLimit(admin, "delete-user", context.userId);

    const userId = data.user_id;
    if (!g.isUUID(userId)) {
      throw new g.HttpError(400, "user_id must be a valid UUID");
    }
    if (userId === context.userId) {
      throw new g.HttpError(400, "Cannot delete your own account");
    }

    // BL-37 / EC-M5: guarda anti-último-admin vía RPC con lock.
    const { error: assertErr } = await admin.rpc("assert_not_last_admin", {
      _target_user_id: userId,
    });
    if (assertErr) {
      const msg = assertErr.message ?? "";
      if (msg.includes("LAST_ADMIN_CANNOT_BE_DELETED")) {
        throw new g.HttpError(
          400,
          "LAST_ADMIN_CANNOT_BE_DELETED: no puedes eliminar al último administrador del sistema.",
        );
      }
      console.error("assert_not_last_admin failed:", assertErr);
      throw new g.HttpError(500, "Failed to validate admin invariant");
    }

    const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
    if (deleteErr) {
      console.error("auth.admin.deleteUser failed:", deleteErr);
      throw new g.HttpError(400, "Failed to delete user");
    }

    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("user_id", userId);

    return { success: true };
  });

export interface ResetPasswordResult {
  success: boolean;
  email: string;
  recovery_link: string;
}

export const resetUserPasswordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string }) => data)
  .handler(async ({ data, context }): Promise<ResetPasswordResult> => {
    const g = await import("./server/adminGuards.server");
    const { admin } = await g.requireAdmin(context.supabase, context.userId);
    await g.enforceRateLimit(admin, "reset-user-password", context.userId);

    const userId = data.user_id;
    await assertResettableTarget(g, admin, userId, context.userId);

    const { data: userData, error: getUserErr } = await admin.auth.admin
      .getUserById(userId);
    if (getUserErr || !userData?.user?.email) {
      throw new g.HttpError(404, "User not found");
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: userData.user.email,
    });
    if (linkErr || !linkData?.properties?.action_link) {
      console.error("[reset-user-password] generateLink failed", {
        code: (linkErr as { code?: string } | null)?.code ?? "unknown",
        status: (linkErr as { status?: number } | null)?.status ?? 0,
      });
      throw new g.HttpError(500, "No se pudo generar el enlace de recuperación");
    }

    const { error: revokeErr } = await admin.rpc("revoke_user_sessions", {
      _user_id: userId,
    });
    if (revokeErr) {
      console.error("[reset-user-password] revoke sessions failed", {
        code: revokeErr.code ?? "unknown",
      });
    }

    return {
      success: true,
      email: userData.user.email,
      recovery_link: linkData.properties.action_link,
    };
  });

export const toggleUserStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string; is_active: boolean }) => data)
  .handler(async ({ data, context }) => {
    const g = await import("./server/adminGuards.server");
    const { admin } = await g.requireAdmin(context.supabase, context.userId);
    await g.enforceRateLimit(admin, "toggle-user-status", context.userId);

    const { user_id: userId, is_active: isActive } = data;
    if (!g.isUUID(userId)) {
      throw new g.HttpError(400, "user_id must be a valid UUID");
    }
    if (userId === context.userId) {
      throw new g.HttpError(400, "No puedes desactivar tu propia cuenta");
    }
    if (typeof isActive !== "boolean") {
      throw new g.HttpError(400, "is_active must be a boolean");
    }

    // BL-46: al desactivar un admin, garantizar que quede ≥1 admin activo.
    if (isActive === false) {
      const { data: targetAdmin } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (targetAdmin) {
        const { data: otherAdmins } = await admin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .neq("user_id", userId);

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
    }

    // DB4-07 (N6): primero profiles; si el trigger rechaza, no se baneó nada.
    const { error: profileErr } = await admin
      .from("profiles")
      .update({ is_active: isActive })
      .eq("user_id", userId);
    if (profileErr) {
      console.error("[toggle-user-status] profile update error:", profileErr);
      throw new g.HttpError(400, "No se pudo actualizar el estado del usuario");
    }

    const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: isActive ? "none" : "876600h",
    });
    if (authErr) {
      await admin
        .from("profiles")
        .update({ is_active: !isActive })
        .eq("user_id", userId);
      console.error("[toggle-user-status] auth ban error:", authErr);
      throw new g.HttpError(400, "No se pudo actualizar el estado del usuario");
    }

    // SEC-M2: al desactivar, revocar sesiones/refresh tokens vigentes.
    if (isActive === false) {
      const { error: revokeErr } = await admin.rpc("revoke_user_sessions", {
        _user_id: userId,
      });
      if (revokeErr) {
        console.error("[toggle-user-status] revoke sessions:", revokeErr.message);
      }
    }

    return { success: true, is_active: isActive };
  });
