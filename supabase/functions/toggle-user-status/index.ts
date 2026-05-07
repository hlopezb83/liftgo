import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { requireAdmin, enforceRateLimit } from "../_shared/auth.ts";
import { isUUID } from "../_shared/validate.ts";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const limited = await enforceRateLimit(req, auth.adminClient, "toggle-user-status", auth.userId);
    if (limited) return limited;

    const body = await req.json();
    const { user_id, is_active } = body;

    if (!isUUID(user_id)) {
      return new Response(
        JSON.stringify({ error: "user_id must be a valid UUID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (user_id === auth.userId) {
      return new Response(
        JSON.stringify({ error: "No puedes desactivar tu propia cuenta" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof is_active !== "boolean") {
      return new Response(
        JSON.stringify({ error: "is_active must be a boolean" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: authErr } = await auth.adminClient.auth.admin.updateUserById(user_id, {
      ban_duration: is_active ? "none" : "876600h",
    });

    if (authErr) {
      return new Response(JSON.stringify({ error: authErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: profileErr } = await auth.adminClient
      .from("profiles")
      .update({ is_active })
      .eq("user_id", user_id);

    if (profileErr) {
      return new Response(JSON.stringify({ error: profileErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, is_active }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (_err) {
    console.error("toggle-user-status error:", _err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
