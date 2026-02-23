import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isEmail, isNonEmptyString, isValidRole } from "../_shared/validate.ts";

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
    const { email, full_name, role, password } = body;

    if (!isEmail(email)) {
      return new Response(
        JSON.stringify({ error: "A valid email is required (max 255 chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!isNonEmptyString(full_name, 200)) {
      return new Response(
        JSON.stringify({ error: "full_name is required (max 200 chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!isValidRole(role)) {
      return new Response(
        JSON.stringify({ error: "Invalid role. Must be admin, administrativo, dispatcher or mechanic" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (password !== undefined && (typeof password !== "string" || password.length < 8)) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const finalPassword = password || (crypto.randomUUID() + "Aa1!");
    const { data: newUser, error: createErr } =
      await adminClient.auth.admin.createUser({
        email,
        password: finalPassword,
        email_confirm: true,
        user_metadata: { full_name },
      });

    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user.id;

    if (role !== "dispatcher") {
      await adminClient
        .from("user_roles")
        .update({ role })
        .eq("user_id", userId);
    }

    await adminClient
      .from("profiles")
      .update({ full_name })
      .eq("user_id", userId);

    return new Response(
      JSON.stringify({ success: true, user_id: userId, email, password: finalPassword }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (_err) {
    console.error("invite-user error:", _err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
