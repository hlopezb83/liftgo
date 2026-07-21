import { handleCors } from "../_shared/cors.ts";
import {
  enforceRateLimit,
  generateSecurePassword,
  requireAdmin,
} from "../_shared/auth.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { isEmail, isNonEmptyString, isValidRole } from "../_shared/validate.ts";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const limited = await enforceRateLimit(
      req,
      auth.adminClient,
      "invite-user",
      auth.userId,
    );
    if (limited) return limited;

    const { email, full_name, role, password } = await req.json();

    if (!isEmail(email)) {
      return jsonError(req, 400, "A valid email is required (max 255 chars)");
    }
    if (!isNonEmptyString(full_name, 200)) {
      return jsonError(req, 400, "full_name is required (max 200 chars)");
    }
    if (!isValidRole(role)) {
      return jsonError(req, 400, "Invalid role");
    }
    if (
      password !== undefined &&
      (typeof password !== "string" || password.length < 8)
    ) {
      return jsonError(req, 400, "Password must be at least 8 characters");
    }

    // AUTH-001: verificar unicidad de email antes de crear el usuario para
    // devolver 409 explícito en vez de un error crudo de Supabase Auth.
    const emailLc = email.toLowerCase();
    const { data: existingProfile } = await auth.adminClient
      .from("profiles")
      .select("user_id")
      .ilike("email", emailLc)
      .maybeSingle();
    if (existingProfile) {
      return jsonError(req, 409, "Ya existe un usuario con ese correo");
    }

    const finalPassword = password || generateSecurePassword();
    const { data: newUser, error: createErr } = await auth.adminClient.auth
      .admin.createUser({
        email,
        password: finalPassword,
        email_confirm: true,
        user_metadata: { full_name },
      });

    if (createErr) {
      const msg = createErr.message || "";
      const status = /already|registered|exists/i.test(msg) ? 409 : 400;
      return jsonError(req, status, msg || "No se pudo crear el usuario");
    }

    const userId = newUser.user.id;

    // BLOQUE 3.2: upsert en vez de update. El default asumido (trigger crea
    // user_roles con 'dispatcher') no siempre se materializa a tiempo por
    // ordering de triggers; un UPDATE silencioso dejaba admins recién
    // invitados sin fila en user_roles y sin acceso.
    const { error: roleErr } = await auth.adminClient
      .from("user_roles")
      .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
    if (roleErr) {
      console.error("[invite-user] no se pudo asignar rol", {
        userId,
        role,
        err: roleErr,
      });
    }

    // Bloque 5.4 (R4): tras el upsert, purgar cualquier rol residual (p.ej.
    // 'customer' auto-creado o un rol previo si el trigger disparó antes).
    // Sin esto, el usuario acumulaba roles y ganaba permisos incorrectos.
    const { error: pruneErr } = await auth.adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .neq("role", role);
    if (pruneErr) {
      console.error("[invite-user] no se pudieron purgar roles residuales", {
        userId,
        role,
        err: pruneErr,
      });
    }

    await auth.adminClient
      .from("profiles")
      .update({ full_name, email })
      .eq("user_id", userId);

    return jsonResponse(req, { success: true, user_id: userId, email });
  } catch (_err) {
    console.error("invite-user error:", _err);
    return jsonError(req, 500, "Internal server error");
  }
});
