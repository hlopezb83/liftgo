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

    // BL-37: bloquear si el objetivo es admin y es el último admin activo.
    const { data: targetAdmin } = await auth.adminClient
      .from("user_roles")
      .select("user_id")
      .eq("user_id", user_id)
      .eq("role", "admin")
      .maybeSingle();

    if (targetAdmin) {
      const { count: adminCount } = await auth.adminClient
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "admin");
      if ((adminCount ?? 0) <= 1) {
        return jsonError(
          req,
          400,
          "LAST_ADMIN_CANNOT_BE_DELETED: no puedes eliminar al último administrador del sistema.",
        );
      }
    }

    await auth.adminClient.from("user_roles").delete().eq("user_id", user_id);
    await auth.adminClient.from("profiles").delete().eq("user_id", user_id);

    const { error: deleteErr } = await auth.adminClient.auth.admin.deleteUser(
      user_id,
    );
    if (deleteErr) {
      return jsonError(req, 400, "Failed to delete user");
    }

    return jsonResponse(req, { success: true });
  } catch (_err) {
    console.error("delete-user error:", _err);
    return jsonError(req, 500, "Internal server error");
  }
});
