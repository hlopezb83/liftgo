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

    // BL-46: si se está desactivando a un admin, garantizar que quede ≥1 admin activo.
    if (is_active === false) {
      const { data: targetAdmin } = await auth.adminClient
        .from("user_roles")
        .select("user_id")
        .eq("user_id", user_id)
        .eq("role", "admin")
        .maybeSingle();

      if (targetAdmin) {
        const { data: otherAdmins } = await auth.adminClient
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .neq("user_id", user_id);

        const otherIds = (otherAdmins ?? []).map((a) => a.user_id);
        let activeOthers = 0;
        if (otherIds.length > 0) {
          const { count } = await auth.adminClient
            .from("profiles")
            .select("user_id", { count: "exact", head: true })
            .in("user_id", otherIds)
            .eq("is_active", true);
          activeOthers = count ?? 0;
        }

        if (activeOthers === 0) {
          return jsonError(
            req,
            400,
            "LAST_ADMIN_CANNOT_BE_DEACTIVATED: no puedes desactivar al último administrador activo.",
          );
        }
      }
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
