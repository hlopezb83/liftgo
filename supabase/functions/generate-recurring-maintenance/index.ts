import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { getAdminClient, getCallerClient, getSupabaseEnv } from "../_shared/supabaseClients.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = getAdminClient();
    const { serviceKey } = getSupabaseEnv();

    // Always require Authorization header. Either:
    //  - CRON_SECRET dedicado (cron / scheduled invocations), o
    //  - service_role token (compat), o
    //  - JWT de admin/administrativo
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonError(req, 401, "No autorizado");
    }
    const bearer = authHeader.slice("Bearer ".length).trim();
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    // Comparación estricta — `includes` previo aceptaba cualquier string que
    // contuviera la service key como substring (riesgo de bypass).
    const isServiceCall = (cronSecret.length > 0 && bearer === cronSecret) ||
      bearer === serviceKey;
    if (!isServiceCall) {
      const callerClient = getCallerClient(req);
      const { data: claimsData, error: claimsError } = await callerClient.auth
        .getClaims(bearer);
      if (claimsError || !claimsData?.claims) {
        return jsonError(req, 401, "No autorizado");
      }
      const callerId = claimsData.claims.sub as string;
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId);
      const roles = (roleData ?? []).map((r: { role: string }) => r.role);
      if (!roles.includes("admin") && !roles.includes("administrativo")) {
        return jsonError(req, 403, "Solo admin/administrativo puede ejecutar esta función");
      }
    }

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${
      String(now.getMonth() + 1).padStart(2, "0")
    }`;
    const firstOfMonth = `${currentMonth}-01`;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const firstOfNextMonth = `${nextMonth.getFullYear()}-${
      String(nextMonth.getMonth() + 1).padStart(2, "0")
    }-01`;

    // Get active policies where forklift is rented and not yet generated for this month
    const { data: policies, error: pErr } = await supabase
      .from("maintenance_policies")
      .select("*, forklifts!inner(id, status, name)")
      .eq("is_active", true)
      .eq("forklifts.status", "rented");

    if (pErr) throw pErr;

    type Policy = {
      id: string;
      forklift_id: string;
      service_type: string;
      description: string | null;
      provider_name: string | null;
      monthly_cost: number;
      last_generated_month: string | null;
      forklifts?: { name?: string | null } | null;
    };

    const toGenerate = ((policies ?? []) as Policy[]).filter(
      (p) => !p.last_generated_month || p.last_generated_month < currentMonth,
    );

    let generated = 0;
    const skipped = (policies?.length ?? 0) - toGenerate.length;
    const details: string[] = [];

    if (toGenerate.length > 0) {
      const logsToInsert = toGenerate.map((policy) => ({
        forklift_id: policy.forklift_id,
        service_type: policy.service_type,
        description: policy.description ||
          `Póliza mensual - ${policy.provider_name}`,
        cost: policy.monthly_cost,
        performed_by: policy.provider_name,
        performed_at: firstOfMonth,
        work_status: "completed",
        next_service_date: firstOfNextMonth,
      }));

      const { error: bulkInsertErr } = await supabase
        .from("maintenance_logs")
        .insert(logsToInsert);

      if (bulkInsertErr) {
        details.push(`Error en inserción masiva: ${bulkInsertErr.message}`);
      } else {
        const policyIds = toGenerate.map((p) => p.id);
        const { error: bulkUpdateErr } = await supabase
          .from("maintenance_policies")
          .update({ last_generated_month: currentMonth })
          .in("id", policyIds);

        if (bulkUpdateErr) {
          details.push(
            `Logs insertados pero error al marcar pólizas: ${bulkUpdateErr.message}`,
          );
        }
        generated = toGenerate.length;
        for (const policy of toGenerate) {
          details.push(`✓ ${policy.forklifts?.name ?? "(sin nombre)"}`);
        }
      }
    }

    return jsonResponse(req, { generated, skipped, month: currentMonth, details });
  } catch (err) {
    console.error("[generate-recurring-maintenance]", err);
    return jsonError(req, 500, "Error interno del servidor");
  }
});
