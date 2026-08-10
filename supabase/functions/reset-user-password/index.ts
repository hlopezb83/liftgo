import { handleCors } from "../_shared/cors.ts";
import { enforceRateLimit, requireAdmin } from "../_shared/auth.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { isUUID } from "../_shared/validate.ts";

/**
 * SEC-M3: el admin ya no elige ni conoce la contraseña del usuario.
 * Se genera un recovery link de un solo uso (el usuario define su nueva
 * contraseña) y se revocan sus sesiones activas. Objetivos admin prohibidos:
 * un admin no puede tomar la cuenta de otro admin.
 */
Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const limited = await enforceRateLimit(
      req,
      auth.adminClient,
      "reset-user-password",
      auth.userId,
    );
    if (limited) return limited;

    const { user_id } = await req.json();

    if (!isUUID(user_id)) {
      return jsonError(req, 400, "user_id must be a valid UUID");
    }
    if (user_id === auth.userId) {
      return jsonError(
        req,
        400,
        "Para tu propia cuenta usa 'Olvidé mi contraseña' en el login",
      );
    }

    // Guarda anti-takeover: prohibido restablecer la contraseña de un admin.
    const { data: targetAdmin } = await auth.adminClient
      .from("user_roles")
      .select("user_id")
      .eq("user_id", user_id)
      .eq("role", "admin")
      .maybeSingle();
    if (targetAdmin) {
      return jsonError(
        req,
        403,
        "No puedes restablecer la contraseña de un administrador",
      );
    }

    const { data: userData, error: getUserErr } = await auth.adminClient.auth
      .admin.getUserById(user_id);
    if (getUserErr || !userData?.user?.email) {
      return jsonError(req, 404, "User not found");
    }

    // Recovery link de un solo uso: la nueva contraseña la define el usuario,
    // nunca pasa por las manos del admin ni por la base de datos en claro.
    const { data: linkData, error: linkErr } = await auth.adminClient.auth
      .admin.generateLink({
        type: "recovery",
        email: userData.user.email,
      });
    if (linkErr || !linkData?.properties?.action_link) {
      console.error("[reset-user-password] generateLink:", linkErr?.message);
      return jsonError(req, 500, "No se pudo generar el enlace de recuperación");
    }

    // Revocar sesiones vigentes del usuario (RPC del FIX-02).
    const { error: revokeErr } = await auth.adminClient.rpc(
      "revoke_user_sessions",
      { _user_id: user_id },
    );
    if (revokeErr) {
      console.error("[reset-user-password] revoke sessions:", revokeErr.message);
    }

    return jsonResponse(req, {
      success: true,
      email: userData.user.email,
      recovery_link: linkData.properties.action_link,
    });
  } catch (_err) {
    console.error("reset-user-password error:", _err);
    return jsonError(req, 500, "Internal server error");
  }
});
