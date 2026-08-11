import { handleCors } from "../_shared/cors.ts";
import {
  enforceRateLimit,
  generateSecurePassword,
  requireAdmin,
} from "../_shared/auth.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { isEmail, isNonEmptyString, isValidRole } from "../_shared/validate.ts";
import { assignRoleToUser } from "./assignRole.ts";

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
    // SEC-B5: si el admin fija la contraseña manualmente, exigir fortaleza:
    // 12-72 caracteres con mayúscula, minúscula, dígito y símbolo.
    if (password !== undefined) {
      const strong = typeof password === "string" &&
        password.length >= 12 && password.length <= 72 &&
        /[a-z]/.test(password) && /[A-Z]/.test(password) &&
        /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
      if (!strong) {
        return jsonError(
          req,
          400,
          "La contraseña debe tener 12-72 caracteres e incluir mayúsculas, minúsculas, números y símbolos",
        );
      }
    }

    // AUTH-001: verificar unicidad de email antes de crear el usuario para
    // devolver 409 explícito en vez de un error crudo de Supabase Auth.
    // B-2: `.eq` en vez de `.ilike` — con ilike los comodines `%`/`_` del
    // email producían falsos 409. `emailLc` ya está en minúsculas (línea de
    // arriba) y GoTrue normaliza los emails a minúsculas al crear el usuario,
    // así que la comparación exacta contra profiles.email es suficiente.
    const emailLc = email.toLowerCase();
    const { data: existingProfile } = await auth.adminClient
      .from("profiles")
      .select("user_id")
      .eq("email", emailLc)
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

    // DB2-01: el árbitro del conflicto debe ser el índice único VIGENTE
    // user_roles_one_role_per_user (user_id). Con "user_id,role" el upsert
    // reventaba con duplicate key y, al solo loguearse, el prune posterior
    // borraba el rol residual: el invitado quedaba SIN rol con respuesta 200.
    // El upsert sobre (user_id) reemplaza cualquier rol auto-creado por el
    // trigger de signup, así que el prune ya no es necesario.
    const roleResult = await assignRoleToUser(auth.adminClient, userId, role);
    if (!roleResult.ok) {
      return jsonError(req, 500, roleResult.message);
    }

    await auth.adminClient
      .from("profiles")
      .update({ full_name, email })
      .eq("user_id", userId);

    // SEC-B5: recovery link para que el invitado defina su propia contraseña
    // en el primer acceso. El admin comparte el enlace; no necesita conocer
    // ninguna contraseña. Si falla, no bloquea la invitación (el admin puede
    // reintentar desde reset-user-password, FIX-03).
    const { data: linkData, error: linkErr } = await auth.adminClient.auth
      .admin.generateLink({
        type: "recovery",
        email,
      });
    if (linkErr) {
      console.error("[invite-user] generateLink:", linkErr.message);
    }

    return jsonResponse(req, {
      success: true,
      user_id: userId,
      email,
      recovery_link: linkData?.properties?.action_link ?? null,
    });
  } catch (_err) {
    console.error("invite-user error:", _err);
    return jsonError(req, 500, "Internal server error");
  }
});
