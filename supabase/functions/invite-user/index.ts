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

    const finalPassword = password || generateSecurePassword();
    const { data: newUser, error: createErr } = await auth.adminClient.auth
      .admin.createUser({
        email,
        password: finalPassword,
        email_confirm: true,
        user_metadata: { full_name },
      });

    if (createErr) return jsonError(req, 400, createErr.message);

    const userId = newUser.user.id;

    if (role !== "dispatcher") {
      await auth.adminClient.from("user_roles").update({ role }).eq(
        "user_id",
        userId,
      );
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
