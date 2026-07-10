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
      "toggle-user-status",
      auth.userId,
    );
    if (limited) return limited;

    const { user_id, is_active } = await req.json();

    if (!isUUID(user_id)) {
      return jsonError(req, 400, "user_id must be a valid UUID");
    }
    if (user_id === auth.userId) {
      return jsonError(req, 400, "No puedes desactivar tu propia cuenta");
    }
    if (typeof is_active !== "boolean") {
      return jsonError(req, 400, "is_active must be a boolean");
    }

    const { error: authErr } = await auth.adminClient.auth.admin.updateUserById(
      user_id,
      { ban_duration: is_active ? "none" : "876600h" },
    );
    if (authErr) return jsonError(req, 400, authErr.message);

    const { error: profileErr } = await auth.adminClient
      .from("profiles")
      .update({ is_active })
      .eq("user_id", user_id);
    if (profileErr) return jsonError(req, 400, profileErr.message);

    return jsonResponse(req, { success: true, is_active });
  } catch (_err) {
    console.error("toggle-user-status error:", _err);
    return jsonError(req, 500, "Internal server error");
  }
});
