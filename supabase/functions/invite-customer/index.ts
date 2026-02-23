import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isUUID, isEmail } from "../_shared/validate.ts";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!roleData || roleData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { customer_id, email } = body;

    if (!isUUID(customer_id)) {
      return new Response(
        JSON.stringify({ error: "customer_id must be a valid UUID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!isEmail(email)) {
      return new Response(
        JSON.stringify({ error: "A valid email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: customer, error: custErr } = await adminClient
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
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tempPassword = crypto.randomUUID() + "Aa1!";
    const { data: newUser, error: createErr } =
      await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: customer.name },
      });

    if (createErr) {
      return new Response(
        JSON.stringify({ error: createErr.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = newUser.user.id;

    await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "dispatcher");

    await adminClient
      .from("user_roles")
      .insert({ user_id: userId, role: "customer" });

    await adminClient
      .from("profiles")
      .insert({ user_id: userId, full_name: customer.name });

    await adminClient
      .from("customers")
      .update({ user_id: userId })
      .eq("id", customer_id);

    const { error: resetErr } =
      await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
      });

    if (resetErr) {
      console.error("Password reset email error:", resetErr.message);
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (_err) {
    console.error("invite-customer error:", _err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
