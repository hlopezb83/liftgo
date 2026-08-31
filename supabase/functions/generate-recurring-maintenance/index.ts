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

    // FIX-14: sin filtro de estatus en la query — las pólizas activas de
    // unidades no rentadas se clasifican como "omitidas por estado" y se
    // reportan, en vez de desaparecer silenciosamente.
    const { data: policies, error: pErr } = await supabase
      .from("maintenance_policies")
      .select("*, forklifts!inner(id, status, name)")
      .eq("is_active", true);

    if (pErr) throw pErr;

    type Policy = {
      id: string;
      forklift_id: string;
      service_type: string;
      description: string | null;
      provider_name: string | null;
      monthly_cost: number;
      last_generated_month: string | null;
      forklifts?: { name?: string | null; status?: string | null } | null;
    };

    const pendingPolicies = ((policies ?? []) as Policy[]).filter(
      (p) => !p.last_generated_month || p.last_generated_month < currentMonth,
    );
    const omittedByStatus = pendingPolicies.filter(
      (p) => p.forklifts?.status !== "rented",
    );
    const candidates = pendingPolicies.filter(
      (p) => p.forklifts?.status === "rented",
    );

    let generated = 0;
    // skipped = ya generadas este mes (las omitidas por estado van aparte).
    let skipped = (policies?.length ?? 0) - pendingPolicies.length;
    const details: string[] = [];
    for (const p of omittedByStatus) {
      details.push(
        `⊘ ${
          p.forklifts?.name ?? p.forklift_id
        } — omitida: unidad no rentada (estado: ${
          p.forklifts?.status ?? "desconocido"
        })`,
      );
    }

    // BL-41: claim atómico por póliza ANTES de insertar el log. Si otra corrida
    // ya reclamó el mes, el claim devuelve false y omitimos la póliza
    // (idempotente ante doble corrida / retry).
    //
    // R-REP-42703: no usar `.update().or(...)`: PostgREST rechaza filtros `or=`
    // en mutaciones con `42703 column ... does not exist`. La condición vive en
    // el RPC atómico `claim_maintenance_policy_month`.
    // A3B-08: catch-up de meses saltados. Antes se comparaba únicamente
    // `last_generated_month < currentMonth` y sólo se generaba el mes ACTUAL,
    // por lo que si el cron dejó de correr 2+ meses, esos meses quedaban sin
    // póliza generada para siempre (el claim del mes actual "tapaba" el hueco).
    // Ahora se itera mes por mes desde el siguiente a `last_generated_month`
    // hasta el mes actual, con un tope de 12 iteraciones por póliza (blindaje
    // ante datos corruptos / pólizas muy antiguas).
    const MAX_CATCHUP_MONTHS = 12;

    function nextMonth(yyyyMm: string): string {
      const [y, m] = yyyyMm.split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1 + 1, 1));
      return `${d.getUTCFullYear()}-${
        String(d.getUTCMonth() + 1).padStart(2, "0")
      }`;
    }

    for (const policy of candidates) {
      const pendingMonths: string[] = [];
      let cursor = policy.last_generated_month
        ? nextMonth(policy.last_generated_month)
        : currentMonth;
      let iter = 0;
      while (cursor <= currentMonth && iter < MAX_CATCHUP_MONTHS) {
        pendingMonths.push(cursor);
        cursor = nextMonth(cursor);
        iter += 1;
      }

      for (const month of pendingMonths) {
        const monthFirstDay = `${month}-01`;
        const { data: claimed, error: claimErr } = await (supabase as unknown as {
          rpc: (
            fn: string,
            args: Record<string, unknown>,
          ) => Promise<
            { data: boolean | null; error: { message?: string } | null }
          >;
        }).rpc("claim_maintenance_policy_month", {
          p_policy_id: policy.id,
          p_month: month,
        });

        if (claimErr) {
          details.push(
            `Error al reclamar ${policy.id} (${month}): ${claimErr.message}`,
          );
          continue;
        }
        if (claimed !== true) {
          skipped += 1;
          continue;
        }

        // BL-40: el log queda 'scheduled'; no carga P&L hasta que el mecánico
        // lo confirme como 'completed'.
        // FIX-R2-02 (N2): el importe va en manual_cost (el trigger
        // recalc_maintenance_log_cost pisa `cost` a 0 sin partes/labor) y NO se
        // escribe next_service_date: un servicio de póliza programado no debe
        // activar el buffer de disponibilidad ±3 días (M17/FIX-R2-01).
        const { error: insertErr } = await supabase
          .from("maintenance_logs")
          .insert({
            forklift_id: policy.forklift_id,
            service_type: policy.service_type,
            description: policy.description ||
              `Póliza mensual - ${policy.provider_name}`,
            manual_cost: policy.monthly_cost,
            performed_by: policy.provider_name,
            performed_at: monthFirstDay,
            work_status: "scheduled",
          });

        if (insertErr) {
          // Rollback del claim para permitir un reintento posterior.
          await supabase
            .from("maintenance_policies")
            .update({ last_generated_month: policy.last_generated_month })
            .eq("id", policy.id);
          details.push(
            `Error al insertar log ${policy.id} (${month}): ${insertErr.message}`,
          );
          continue;
        }

        generated += 1;
        details.push(`✓ ${policy.forklifts?.name ?? "(sin nombre)"} (${monthFirstDay})`);
      }
    }

    return jsonResponse(req, {
      generated,
      skipped,
      omitted_by_status: omittedByStatus.length,
      month: currentMonth,
      details,
    });
  } catch (err) {
    console.error("[generate-recurring-maintenance]", err);
    return jsonError(req, 500, "Error interno del servidor");
  }
});
