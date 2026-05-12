import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const headers = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Always require Authorization header. Either:
    //  - service_role token (cron / scheduled invocations), or
    //  - a JWT belonging to admin/administrativo
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    const isServiceCall = authHeader.includes(serviceKey);
    if (!isServiceCall) {
      const token = authHeader.replace("Bearer ", "");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "No autorizado" }), {
          status: 401,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }
      const callerId = claimsData.claims.sub as string;
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId);
      const roles = (roleData ?? []).map((r: { role: string }) => r.role);
      if (!roles.includes("admin") && !roles.includes("administrativo")) {
        return new Response(JSON.stringify({ error: "Solo admin/administrativo puede ejecutar esta función" }), {
          status: 403,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }
    }

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const firstOfMonth = `${currentMonth}-01`;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const firstOfNextMonth = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

    // Get active policies where forklift is rented and not yet generated for this month
    const { data: policies, error: pErr } = await supabase
      .from("maintenance_policies")
      .select("*, forklifts!inner(id, status, name)")
      .eq("is_active", true)
      .eq("forklifts.status", "rented");

    if (pErr) throw pErr;

    const toGenerate = (policies ?? []).filter(
      (p: any) => !p.last_generated_month || p.last_generated_month < currentMonth
    );

    let generated = 0;
    let skipped = (policies?.length ?? 0) - toGenerate.length;
    const details: string[] = [];

    for (const policy of toGenerate) {
      // Insert maintenance log
      const { error: insertErr } = await supabase.from("maintenance_logs").insert({
        forklift_id: policy.forklift_id,
        service_type: policy.service_type,
        description: policy.description || `Póliza mensual - ${policy.provider_name}`,
        cost: policy.monthly_cost,
        performed_by: policy.provider_name,
        performed_at: firstOfMonth,
        work_status: "completed",
        next_service_date: firstOfNextMonth,
      });

      if (insertErr) {
        details.push(`Error ${(policy as any).forklifts?.name}: ${insertErr.message}`);
        continue;
      }

      // Update last_generated_month
      await supabase
        .from("maintenance_policies")
        .update({ last_generated_month: currentMonth })
        .eq("id", policy.id);

      generated++;
      details.push(`✓ ${(policy as any).forklifts?.name}`);
    }

    return new Response(
      JSON.stringify({ generated, skipped, month: currentMonth, details }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[generate-recurring-maintenance]", err);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }
});
