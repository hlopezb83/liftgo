import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { requireServiceOrRole } from "../_shared/auth.ts";
import { getAdminClient } from "../_shared/supabaseClients.ts";
import { authenticateCronRequest } from "../_shared/cronAuth.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Lote E · unificación: mismo patrón que generate-recurring-invoices
    // (cron timing-safe → fallback JWT admin/administrativo).
    const cronAuth = await authenticateCronRequest(req);
    let supabase;
    if (cronAuth.ok) {
      supabase = getAdminClient();
    } else {
      const auth = await requireServiceOrRole(req, [
        "admin",
        "administrativo",
      ]);
      if (!auth.ok) return auth.response;
      supabase = auth.adminClient;
    }

    // BL-42: calcular el mes actual en America/Monterrey (evita off-by-one
    // durante las primeras horas UTC del día 1 en zonas GMT-6).
    const nowMty = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" }),
    );
    const currentMonth = `${nowMty.getFullYear()}-${
      String(nowMty.getMonth() + 1).padStart(2, "0")
    }`;
    const firstOfMonth = `${currentMonth}-01`;
    const nextMonth = new Date(
      nowMty.getFullYear(),
      nowMty.getMonth() + 1,
      1,
    );
    const firstOfNextMonth = `${nextMonth.getFullYear()}-${
      String(nextMonth.getMonth() + 1).padStart(2, "0")
    }-01`;

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

    const candidates = ((policies ?? []) as Policy[]).filter(
      (p) => !p.last_generated_month || p.last_generated_month < currentMonth,
    );

    let generated = 0;
    let skipped = (policies?.length ?? 0) - candidates.length;
    const details: string[] = [];

    // BL-41: claim atómico por póliza ANTES de insertar el log. Si otra corrida
    // ya reclamó el mes, el UPDATE devuelve 0 filas y omitimos la póliza
    // (idempotente ante doble corrida / retry).
    for (const policy of candidates) {
      const { data: claimed, error: claimErr } = await supabase
        .from("maintenance_policies")
        .update({ last_generated_month: currentMonth })
        .eq("id", policy.id)
        .or(
          `last_generated_month.is.null,last_generated_month.lt.${currentMonth}`,
        )
        .select("id");

      if (claimErr) {
        details.push(`Error al reclamar ${policy.id}: ${claimErr.message}`);
        continue;
      }
      if (!claimed || claimed.length === 0) {
        skipped += 1;
        continue;
      }

      // BL-40: el log queda 'scheduled'; no carga P&L hasta que el mecánico
      // lo confirme como 'completed'.
      const { error: insertErr } = await supabase
        .from("maintenance_logs")
        .insert({
          forklift_id: policy.forklift_id,
          service_type: policy.service_type,
          description: policy.description ||
            `Póliza mensual - ${policy.provider_name}`,
          cost: policy.monthly_cost,
          performed_by: policy.provider_name,
          performed_at: firstOfMonth,
          work_status: "scheduled",
          next_service_date: firstOfNextMonth,
        });

      if (insertErr) {
        // Rollback del claim para permitir un reintento posterior.
        await supabase
          .from("maintenance_policies")
          .update({ last_generated_month: policy.last_generated_month })
          .eq("id", policy.id);
        details.push(
          `Error al insertar log ${policy.id}: ${insertErr.message}`,
        );
        continue;
      }

      generated += 1;
      details.push(`✓ ${policy.forklifts?.name ?? "(sin nombre)"}`);
    }

    return jsonResponse(req, {
      generated,
      skipped,
      month: currentMonth,
      details,
    });
  } catch (err) {
    console.error("[generate-recurring-maintenance]", err);
    return jsonError(req, 500, "Error interno del servidor");
  }
});
