import { handleCors } from "../_shared/cors.ts";
import { enforceRateLimit, requireAdmin } from "../_shared/auth.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { isUUID } from "../_shared/validate.ts";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const limited = await enforceRateLimit(
      req,
      auth.adminClient,
      "delete-user",
      auth.userId,
    );
    if (limited) return limited;

    const { user_id } = await req.json();

    if (!isUUID(user_id)) {
      return jsonError(req, 400, "user_id must be a valid UUID");
    }
    if (user_id === auth.userId) {
      return jsonError(req, 400, "Cannot delete your own account");
    }

    // BL-37 / EC-M5: guarda anti-último-admin vía RPC con lock (cierra TOCTOU).
    const { error: assertErr } = await auth.adminClient.rpc(
      "assert_not_last_admin",
      { _target_user_id: user_id },
    );
    if (assertErr) {
      const msg = assertErr.message ?? "";
      if (msg.includes("LAST_ADMIN_CANNOT_BE_DELETED")) {
        return jsonError(
          req,
          400,
          "LAST_ADMIN_CANNOT_BE_DELETED: no puedes eliminar al último administrador del sistema.",
        );
      }
      console.error("assert_not_last_admin failed:", assertErr);
      return jsonError(req, 500, "Failed to validate admin invariant");
    }

    // Orden correcto: primero borrar en auth.users; el resto cae en cascade / cleanup posterior.
    // Si esta llamada falla, los roles/profile permanecen intactos (no queda usuario zombie).
    const { error: deleteErr } = await auth.adminClient.auth.admin.deleteUser(
      user_id,
    );
    if (deleteErr) {
      console.error("auth.admin.deleteUser failed:", deleteErr);
      return jsonError(req, 400, "Failed to delete user");
    }

    // Limpieza best-effort de tablas de aplicación (por si no hay cascade a auth.users).
    await auth.adminClient.from("user_roles").delete().eq("user_id", user_id);
    await auth.adminClient.from("profiles").delete().eq("user_id", user_id);

    return jsonResponse(req, { success: true });
  } catch (_err) {
    console.error("delete-user error:", _err);
    return jsonError(req, 500, "Internal server error");
  }
});
