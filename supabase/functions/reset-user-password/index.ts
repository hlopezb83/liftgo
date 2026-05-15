import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { requireAdmin, enforceRateLimit, generateSecurePassword } from "../_shared/auth.ts";
import { isUUID } from "../_shared/validate.ts";

function passwordValidationResponse(
  payload: { error: string; code: "weak_password" | "pwned" },
  corsHeaders: Record<string, string>,
) {
  return new Response(JSON.stringify({ success: false, ...payload }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const limited = await enforceRateLimit(req, auth.adminClient, "reset-user-password", auth.userId);
    if (limited) return limited;

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
      if (new_password.length < 8 || new_password.length > 72) {
        return passwordValidationResponse(
          { error: "La contraseña debe tener entre 8 y 72 caracteres", code: "weak_password" },
          corsHeaders,
        );
      }
      newPassword = new_password;
    } else {
      newPassword = generateSecurePassword();
    }

    const { data: userData, error: getUserErr } = await auth.adminClient.auth.admin.getUserById(user_id);
    if (getUserErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: updateErr } = await auth.adminClient.auth.admin.updateUserById(user_id, {
      password: newPassword,
    });

    if (updateErr) {
      const raw = updateErr.message || "Error desconocido";
      const lower = raw.toLowerCase();
      let friendly = raw;
      let code: "weak_password" | "pwned" | "other" = "other";
      if (
        lower.includes("pwned") ||
        lower.includes("leaked") ||
        lower.includes("compromised") ||
        lower.includes("filtrad") ||
        lower.includes("easy to guess") ||
        lower.includes("known to be")
      ) {
        friendly = "Esta contraseña es predecible o aparece en filtraciones públicas conocidas (HIBP). Aunque incluya mayúsculas, números y símbolos, evita secuencias comunes como '1234567890', 'qwerty', fechas o nombres. Pulsa 'Generar contraseña segura'.";
        code = "pwned";
      } else if (lower.includes("should be at least") || lower.includes("at least") || lower.includes("too short")) {
        friendly = "Contraseña demasiado corta. Usa al menos 8 caracteres con mayúsculas, números y símbolos, o pulsa 'Generar contraseña segura'.";
        code = "weak_password";
      } else if (lower.includes("weak") || lower.includes("password")) {
        friendly = "Contraseña no aceptada por la política de seguridad. Evita patrones comunes y prueba con 'Generar contraseña segura'.";
        code = "weak_password";
      }
      if (code !== "other") {
        console.error("[reset-user-password] raw error:", raw);
        return passwordValidationResponse({ error: friendly, code }, corsHeaders);
      }
      console.error("[reset-user-password] raw error:", raw);
      return new Response(JSON.stringify({ error: friendly, code }), {
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
