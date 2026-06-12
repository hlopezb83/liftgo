import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import {
  enforceRateLimit,
  generateSecurePassword,
  requireAdmin,
} from "../_shared/auth.ts";
import { isEmail, isUUID } from "../_shared/validate.ts";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);

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

    const body = await req.json();
    const { customer_id, email } = body;

    if (!isUUID(customer_id)) {
      return new Response(
        JSON.stringify({ error: "customer_id must be a valid UUID" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!isEmail(email)) {
      return new Response(
        JSON.stringify({ error: "A valid email is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: customer, error: custErr } = await auth.adminClient
      .from("customers")
      .select("id, user_id, name")
      .eq("id", customer_id)
      .single();

    if (custErr || !customer) {
      return new Response(JSON.stringify({ error: "Customer not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (customer.user_id) {
      return new Response(
        JSON.stringify({ error: "Customer already has portal access" }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
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

    if (createErr) {
      return new Response(
        JSON.stringify({ error: createErr.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

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

    return new Response(
      JSON.stringify({ success: true, user_id: userId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (_err) {
    console.error("invite-customer error:", _err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
