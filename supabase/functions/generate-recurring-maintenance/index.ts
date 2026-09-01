import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { requireServiceOrRole } from "../_shared/auth.ts";
import { getAdminClient } from "../_shared/supabaseClients.ts";
import { authenticateCronRequest } from "../_shared/cronAuth.ts";
import {
  generateForPolicies,
  type MaintenanceClientLike,
  type MaintenancePolicyRow,
} from "./logic.ts";

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

    const pendingPolicies = ((policies ?? []) as MaintenancePolicyRow[]).filter(
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

    // BL-41 / A3B-08 / R8-01·07·08: el catch-up mensual vive en logic.ts
    // (secuencial, idempotente y monótono bajo concurrencia). Ver comentarios
    // ahí para el detalle de cada invariante.
    const run = await generateForPolicies(
      supabase as unknown as MaintenanceClientLike,
      candidates,
      currentMonth,
    );
    generated = run.generated;
    skipped += run.skipped;
    details.push(...run.details);

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
