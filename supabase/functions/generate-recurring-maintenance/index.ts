import { requireServiceOrRole } from "../_shared/auth.ts";
import { handleCors } from "../_shared/cors.ts";
import { authenticateCronRequest } from "../_shared/cronAuth.ts";
import {
  captureEdgeError,
  setVerifiedEdgeIdentity,
  withVerifiedEdgeJob,
  wrapEdgeFunction,
} from "../_shared/edgeSentry.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { getAdminClient } from "../_shared/supabaseClients.ts";
import {
  generateForPolicies,
  type MaintenanceClientLike,
  type MaintenancePolicyRow,
} from "./logic.ts";
import { resolveMaintenanceScope } from "./scope.ts";

type AuthorizedMaintenance =
  | { ok: false; response: Response }
  | {
    ok: true;
    supabase: ReturnType<typeof getAdminClient>;
    scopeOrganizationId: string | null;
    userId?: string;
    role: string;
  };

async function authorizeMaintenanceRun(
  req: Request,
): Promise<AuthorizedMaintenance> {
  // Lote E · unificación: mismo patrón que generate-recurring-invoices
  // (cron timing-safe → fallback JWT admin/administrativo).
  const cronAuth = await authenticateCronRequest(req);
  let supabase: ReturnType<typeof getAdminClient>;
  let scope: Awaited<ReturnType<typeof resolveMaintenanceScope>>;
  let userId: string | undefined;
  let role = "service_role";
  if (cronAuth.ok) {
    supabase = getAdminClient();
    scope = await resolveMaintenanceScope({
      isCron: true,
      role: "service_role",
      userId: "",
      admin: supabase,
    });
  } else {
    const auth = await requireServiceOrRole(req, ["admin", "administrativo"]);
    if (!auth.ok) return { ok: false, response: auth.response };
    supabase = auth.adminClient;
    userId = auth.userId;
    role = auth.role;
    // Multiempresa: una persona autenticada sólo procesa las pólizas de su
    // organización interna; sin membresía única falla cerrado.
    scope = await resolveMaintenanceScope({
      isCron: false,
      role: auth.role,
      userId: auth.userId,
      admin: supabase,
    });
  }
  if (!scope.ok) {
    return {
      ok: false,
      response: jsonError(req, scope.status, scope.message),
    };
  }
  return {
    ok: true,
    supabase,
    scopeOrganizationId: scope.organizationId,
    userId,
    role,
  };
}

function currentMonthMonterrey(): string {
  // BL-42: calcular el mes actual en America/Monterrey (evita off-by-one
  // durante las primeras horas UTC del día 1 en zonas GMT-6).
  const nowMty = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Monterrey" }),
  );
  return `${nowMty.getFullYear()}-${
    String(nowMty.getMonth() + 1).padStart(2, "0")
  }`;
}

function formatOmittedDetails(omitted: MaintenancePolicyRow[]): string[] {
  return omitted.map(
    (p) =>
      `⊘ ${
        p.forklifts?.name ?? p.forklift_id
      } — omitida: unidad no rentada (estado: ${
        p.forklifts?.status ?? "desconocido"
      })`,
  );
}

async function handleRequest(req: Request): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const authRes = await authorizeMaintenanceRun(req);
    if (!authRes.ok) return authRes.response;
    const { supabase, scopeOrganizationId, userId, role } = authRes;
    setVerifiedEdgeIdentity({
      userId,
      organizationId: scopeOrganizationId ?? undefined,
      role,
    });
    const currentMonth = currentMonthMonterrey();

    // FIX-14: sin filtro de estatus en la query — las pólizas activas de
    // unidades no rentadas se clasifican como "omitidas por estado" y se
    // reportan, en vez de desaparecer silenciosamente.
    let policiesQuery = supabase
      .from("maintenance_policies")
      // Fase 1 multiempresa: organization_id explícito de la póliza (nunca
      // del caller/cron); se propaga a cada maintenance_logs generado.
      .select(
        "*, organization_id, forklifts!inner(id, status, name, organization_id)",
      )
      .eq("is_active", true);
    if (scopeOrganizationId !== null) {
      policiesQuery = policiesQuery.eq("organization_id", scopeOrganizationId);
    }
    const { data: policies, error: pErr } = await policiesQuery;
    if (pErr) throw pErr;

    const allRows = (policies ?? []) as MaintenancePolicyRow[];
    const pendingPolicies = allRows.filter(
      (p) => !p.last_generated_month || p.last_generated_month < currentMonth,
    );
    const omittedByStatus = pendingPolicies.filter(
      (p) => p.forklifts?.status !== "rented",
    );
    const candidates = pendingPolicies.filter(
      (p) => p.forklifts?.status === "rented",
    );

    // skipped = ya generadas este mes (las omitidas por estado van aparte).
    const skipped = allRows.length - pendingPolicies.length;
    const details = formatOmittedDetails(omittedByStatus);

    // BL-41 / A3B-08 / R8-01·07·08: el catch-up mensual vive en logic.ts
    // (secuencial, idempotente y monótono bajo concurrencia).
    // Aislamiento de scope Sentry por empresa en corridas cron multi-tenant.
    const byOrg = new Map<string, MaintenancePolicyRow[]>();
    for (const candidate of candidates) {
      const orgKey = candidate.organization_id ?? "__unknown__";
      const list = byOrg.get(orgKey) ?? [];
      list.push(candidate);
      byOrg.set(orgKey, list);
    }
    let generated = 0;
    let runSkipped = 0;
    let pendingRemaining = 0;
    let failedPolicies = 0;
    for (const [orgKey, orgCandidates] of byOrg) {
      const orgId = orgKey === "__unknown__" ? undefined : orgKey;
      const run = await withVerifiedEdgeJob(
        { organizationId: orgId, role },
        () =>
          generateForPolicies(
            supabase as unknown as MaintenanceClientLike,
            orgCandidates,
            currentMonth,
            scopeOrganizationId,
          ),
      );
      generated += run.generated;
      runSkipped += run.skipped;
      pendingRemaining += run.pendingRemaining;
      failedPolicies += run.failedPolicies;
      details.push(...run.details);
    }

    return jsonResponse(req, {
      generated,
      skipped: skipped + runSkipped,
      omitted_by_status: omittedByStatus.length,
      // R9-17: períodos que siguen pendientes tras el tope de 12 meses por
      // póliza (o tras un corte por error). La próxima corrida los retoma.
      pending_remaining: pendingRemaining,
      failed_policies: failedPolicies,
      month: currentMonth,
      details,
    });
  } catch (err) {
    captureEdgeError(err, 500, "generate_recurring_maintenance_unhandled");
    console.error("[generate-recurring-maintenance]", err);
    return jsonError(req, 500, "Error interno del servidor");
  }
}

Deno.serve(wrapEdgeFunction("generate-recurring-maintenance", handleRequest));
