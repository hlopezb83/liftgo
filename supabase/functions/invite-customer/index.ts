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

    // Compensacion: si alguna escritura falla, borrar el usuario de auth
    // creado (el resto cae en cascade / limpieza best-effort, como delete-user)
    // para no dejar una cuenta huerfana a medias.
    const cleanupInvitedUser = async () => {
      const { error: delErr } = await auth.adminClient.auth.admin.deleteUser(
        userId,
      );
      if (delErr) console.error("invite-customer cleanup deleteUser failed:", delErr);
      await auth.adminClient.from("user_roles").delete().eq("user_id", userId);
      await auth.adminClient.from("profiles").delete().eq("user_id", userId);
    };

    const { error: delRoleErr } = await auth.adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "dispatcher");
    if (delRoleErr) {
      console.error("invite-customer delete user_roles failed:", delRoleErr);
      await cleanupInvitedUser();
      return jsonError(req, 500, "Internal server error");
    }

    const { error: insRoleErr } = await auth.adminClient
      .from("user_roles")
      .insert({ user_id: userId, role: "customer" });
    if (insRoleErr) {
      console.error("invite-customer insert user_roles failed:", insRoleErr);
      await cleanupInvitedUser();
      return jsonError(req, 500, "Internal server error");
    }

    const { error: insProfileErr } = await auth.adminClient
      .from("profiles")
      .insert({ user_id: userId, full_name: customer.name });
    if (insProfileErr) {
      console.error("invite-customer insert profiles failed:", insProfileErr);
      await cleanupInvitedUser();
      return jsonError(req, 500, "Internal server error");
    }

    const { error: linkErr } = await auth.adminClient
      .from("customers")
      .update({ user_id: userId })
      .eq("id", customer_id);
    if (linkErr) {
      console.error("invite-customer link customer failed:", linkErr);
      await cleanupInvitedUser();
      return jsonError(req, 500, "Internal server error");
    }

    const { error: resetErr } = await auth.adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (resetErr) {
      console.error("Password reset email failed", { code: (resetErr as { code?: string }).code ?? "unknown", status: (resetErr as { status?: number }).status ?? 0 });
    }

    return jsonResponse(req, { success: true, user_id: userId });
  } catch (_err) {
    console.error("invite-customer error:", _err);
    return jsonError(req, 500, "Internal server error");
  }
});
