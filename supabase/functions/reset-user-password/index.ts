import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isUUID } from "../_shared/validate.ts";

function generateSecurePassword(length = 20): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => charset[v % charset.length]).join("");
}

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

    const token = authHeader.replace("Bearer ", "");
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .single();

    if (!roleData || roleData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { user_id, new_password } = body;

    if (!isUUID(user_id)) {
      return new Response(
        JSON.stringify({ error: "user_id must be a valid UUID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let newPassword: string;
    if (typeof new_password === "string" && new_password.length > 0) {
      if (new_password.length < 6 || new_password.length > 72) {
        return new Response(
          JSON.stringify({ error: "La contraseña debe tener entre 6 y 72 caracteres" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      newPassword = new_password;
    } else {
      newPassword = generateSecurePassword();
    }

    const { data: userData, error: getUserErr } = await adminClient.auth.admin.getUserById(user_id);
    if (getUserErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: updateErr } = await adminClient.auth.admin.updateUserById(user_id, {
      password: newPassword,
    });

    if (updateErr) {
      const raw = updateErr.message || "Error desconocido";
      const lower = raw.toLowerCase();
      let friendly = raw;
      let code: "weak_password" | "pwned" | "other" = "other";
      if (lower.includes("pwned") || lower.includes("leaked") || lower.includes("compromised") || lower.includes("filtrad")) {
        friendly = "Esta contraseña aparece en filtraciones públicas conocidas (HIBP). Elige una diferente o usa el botón 'Generar contraseña segura'.";
        code = "pwned";
      } else if (lower.includes("weak") || lower.includes("should be at least") || lower.includes("password")) {
        friendly = "Contraseña demasiado débil. Usa al menos 8 caracteres con mayúsculas, números y símbolos, o pulsa 'Generar contraseña segura'.";
        code = "weak_password";
      }
      return new Response(JSON.stringify({ error: friendly, code, raw }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, email: userData.user.email }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (_err) {
    console.error("reset-user-password error:", _err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
