// EC-A2 — Cron: recupera facturas atascadas en cfdi_status='stamping'.
import { handleCors } from "../_shared/cors.ts";
import { authenticateCronRequest } from "../_shared/cronAuth.ts";
import {
  createRequestDiagnostics,
  type EdgeDiagnostics,
} from "../_shared/edgeDiagnostics.ts";
import {
  createFacturapiClient,
  getFacturapiConfigForOrganization,
} from "../_shared/facturapi/client.ts";
import { jsonResponse } from "../_shared/http.ts";
import { resolveCallerOrganization } from "../_shared/orgContext.ts";
import { getAdminClient } from "../_shared/supabaseClients.ts";
import { processCreditNotes } from "./creditNoteProcessor.ts";
import { processInvoices, selectStuckInvoices } from "./invoiceProcessor.ts";
import { processPaymentComplements } from "./paymentProcessor.ts";
import type {
  ProcessorContext,
  ReconciliationResult,
  SelectionContext,
  StuckInvoice,
} from "./processorTypes.ts";
import {
  appendMisconfiguredOrg,
  appendOrphanResults,
  collectOrganizationIds,
  groupAllQueues,
  type GroupedQueues,
  isCompletelyIdle,
  loadSecondaryQueues,
} from "./queueBatch.ts";

const RUN_BUDGET_MS = 50_000;
const RUN_ROW_LIMIT = 10;
const STALE_THRESHOLD_MIN = 10;

type OrgStatus = {
  organization_id: string;
  status: "ok" | "misconfigured";
  error?: string;
};

async function resolveManualOrg(
  req: Request,
  admin: ReturnType<typeof getAdminClient>,
) {
  const manualCallerUserId = req.headers.get("x-caller-user-id");
  if (!manualCallerUserId) return { ok: true as const, organizationId: null };
  const callerOrg = await resolveCallerOrganization(admin, manualCallerUserId);
  if (!callerOrg.ok) {
    return {
      ok: false as const,
      status: callerOrg.status,
      message: callerOrg.message,
    };
  }
  return { ok: true as const, organizationId: callerOrg.organizationId };
}

async function resolveOrgFacturapi(
  admin: ReturnType<typeof getAdminClient>,
  organizationId: string,
): Promise<{ apiKey: string | null; mode: "test" | "live" }> {
  try {
    const cfg = await getFacturapiConfigForOrganization({
      admin,
      env: (k) => Deno.env.get(k),
      organizationId,
    });
    return { apiKey: cfg.apiKey, mode: cfg.mode };
  } catch (err) {
    console.error("[reconcile-stamping] config lookup failed", {
      organization_id: organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { apiKey: null, mode: "test" };
  }
}

async function reconcileOrganization(
  admin: ReturnType<typeof getAdminClient>,
  organizationId: string,
  grouped: GroupedQueues,
  outOfBudget: () => boolean,
  results: ReconciliationResult[],
  organizations: OrgStatus[],
): Promise<boolean> {
  const { apiKey, mode } = await resolveOrgFacturapi(admin, organizationId);
  if (!apiKey) {
    organizations.push({
      organization_id: organizationId,
      status: "misconfigured",
      error: "Facturapi no configurado para esta empresa",
    });
    appendMisconfiguredOrg(results, organizationId, grouped);
    return false;
  }

  organizations.push({ organization_id: organizationId, status: "ok" });
  const context: ProcessorContext = {
    admin,
    client: createFacturapiClient(apiKey),
    organizationId,
    mode,
    outOfBudget,
    results,
  };
  const stuck = grouped.stuck.groups.get(organizationId) ?? [];
  const payments = grouped.payments.groups.get(organizationId) ?? [];
  const ncs = grouped.ncs.groups.get(organizationId) ?? [];
  const folioPending = grouped.folioPending.groups.get(organizationId) ?? [];
  const pdfPending = grouped.pdfPending.groups.get(organizationId) ?? [];

  let truncated = false;
  if (await processInvoices(context, stuck)) truncated = true;
  if (await processPaymentComplements(context, payments, folioPending)) {
    truncated = true;
  }
  if (await processCreditNotes(context, ncs, pdfPending)) truncated = true;
  return truncated;
}

export async function handleRequest(
  req: Request,
  deps: { diagnostics?: EdgeDiagnostics } = {},
): Promise<Response> {
  const startedAt = Date.now();
  const outOfBudget = () => Date.now() - startedAt > RUN_BUDGET_MS;
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json = (b: unknown, status: number) => jsonResponse(req, b, { status });
  const diag = createRequestDiagnostics(deps.diagnostics);

  const admin = getAdminClient();
  const auth = await authenticateCronRequest(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  diag.authenticated({ role: "service_role" });

  const manualOrg = await resolveManualOrg(req, admin);
  if (!manualOrg.ok) {
    return json({ error: manualOrg.message }, manualOrg.status);
  }
  if (manualOrg.organizationId) diag.organization(manualOrg.organizationId);

  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MIN * 60_000)
    .toISOString();
  const selection: SelectionContext = {
    admin,
    cutoff,
    manualOrganizationId: manualOrg.organizationId,
    rowLimit: RUN_ROW_LIMIT,
  };

  const { data: rows, error } = await selectStuckInvoices(selection);
  if (error) {
    diag.capture(error, 500, "reconcile_fetch_stuck_invoices");
    console.error("[reconcile-stamping] fetch failed", error);
    return json({ error: "Fetch failed" }, 500);
  }

  const queues = await loadSecondaryQueues(
    selection,
    (rows ?? []) as StuckInvoice[],
  );
  if (isCompletelyIdle(queues)) return json({ processed: 0, results: [] }, 200);

  const grouped = groupAllQueues(queues);
  const results: ReconciliationResult[] = [];
  if (queues.pdfPendingErr) {
    results.push({
      invoice_id: "unknown",
      status: "nc_pdf_selection_error",
      error: "No se pudo consultar la cola de PDF de NC",
    });
  }
  appendOrphanResults(results, grouped);

  const organizations: OrgStatus[] = [];
  let truncated = false;
  for (const organizationId of collectOrganizationIds(grouped)) {
    if (outOfBudget()) {
      truncated = true;
      break;
    }
    const orgTruncated = await diag.withJob(
      { organizationId, role: "service_role" },
      () =>
        reconcileOrganization(
          admin,
          organizationId,
          grouped,
          outOfBudget,
          results,
          organizations,
        ),
    );
    if (orgTruncated) truncated = true;
  }

  return json(
    { processed: results.length, truncated, results, organizations },
    200,
  );
}
