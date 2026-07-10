import { handleCors } from "../_shared/cors.ts";
import {
  enforceRateLimit,
  generateSecurePassword,
  requireAdmin,
} from "../_shared/auth.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { isEmail, isUUID } from "../_shared/validate.ts";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const limited = await enforceRateLimit(
      req,
      auth.adminClient,
      "invite-customer",
      auth.userId,
    );
    if (limited) return limited;

    const { customer_id, email } = await req.json();

    if (!isUUID(customer_id)) {
      return jsonError(req, 400, "customer_id must be a valid UUID");
    }
    if (!isEmail(email)) {
      return jsonError(req, 400, "A valid email is required");
    }

    const { data: customer, error: custErr } = await auth.adminClient
      .from("customers")
      .select("id, user_id, name")
      .eq("id", customer_id)
      .single();

    if (custErr || !customer) {
      return jsonError(req, 404, "Customer not found");
    }
    if (customer.user_id) {
      return jsonError(req, 409, "Customer already has portal access");
    }

    // Contraseña segura no predecible (rejection sampling, sin sufijo fijo).
    const tempPassword = generateSecurePassword(24);
    const { data: newUser, error: createErr } = await auth.adminClient.auth
      .admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: customer.name },
      });

    if (createErr) return jsonError(req, 400, createErr.message);

    const userId = newUser.user.id;

    await auth.adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "dispatcher");

    await auth.adminClient
      .from("user_roles")
      .insert({ user_id: userId, role: "customer" });

    await auth.adminClient
      .from("profiles")
      .insert({ user_id: userId, full_name: customer.name });

    await auth.adminClient
      .from("customers")
      .update({ user_id: userId })
      .eq("id", customer_id);

    const { error: resetErr } = await auth.adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (resetErr) {
      console.error("Password reset email error:", resetErr.message);
    }

    return jsonResponse(req, { success: true, user_id: userId });
  } catch (_err) {
    console.error("invite-customer error:", _err);
    return jsonError(req, 500, "Internal server error");
  }
});
